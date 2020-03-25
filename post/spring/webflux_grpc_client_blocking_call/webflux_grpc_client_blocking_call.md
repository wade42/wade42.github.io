# Webflux에서 grpc client call 사용시 주의 ( blocking call )

갑자기 서버를 시작하자 마자 `gRPC Client` 요청시 응답이 오지 않는 현상이 발생했다.

서버로 들어온 요청은 잘 처리 하지만 Server to Server로 `gRPC Client` 요청시 hang이 걸리는 현상이 발생했다.

모니터링 결과, 계속 해서 **Thread가 waiting 되는 현상**이 일어났고, 
gRPC로 요청을 보낼 때 마다 waiting되는 Thread는 계속해서 늘어났다.

그래서 로직을 확인 해봤다.

gRPC Client는 BlockingStub를 사용하고 있었다. 보자마자 느낌이 왔다. (사실 이미 여기서 답은 나왔다고 생각했다.)

**Reactive Operator Pipeline 에서 blocking이 있으면 다른 non-blocking 프로세싱에 영향을 주어 비효율적**이기 때문에 추천하지 않는건 알고있었다. 요청에 대한 응답을 전달해야 했기 때문에 blocking을 사용했었지만, 아예 동작이 안되는 경우는 처음이였다.(완전히 정확한 답아니라는 걸 알았다.)

그래서 왜 안되는지 살펴보았다.

일단, 어디서 멈추는지 찾아야 했다. 바로 gRPC Client 내부 동작을 확인했다.

`Grpc Serivce` 클래스에서 `BlocingStub` 내부를 보면 grpc client 요청은 `ClientCalls`의 `blockingUnaryCall`을 호출 한다.

`blockingUnaryCall`을 보면 보기에는 간단하다.
~~~ java
public static <ReqT, RespT> RespT blockingUnaryCall(Channel channel, MethodDescriptor<ReqT, RespT> method, CallOptions callOptions, ReqT req) {
        ClientCalls.ThreadlessExecutor executor = new ClientCalls.ThreadlessExecutor();
        boolean interrupt = false;
        ClientCall call = channel.newCall(method, callOptions.withExecutor(executor));
        ...
~~~
처음에 `executor`를 만드는데, 이것을 이용해서 **blocking**을 구현한다.


참고로 `Stub`는 `Armeria`의 `GrpcClientFactory`에서 생성되고, 이때 `ArmeriaChnnel`도 함께 생성된다. 

**UnaryCall** 메소드에서 인자로 넘겨져 사용되는 `Channel`은 모두 `ArmeriaChannel`이다.
그리고 `Channel`로 `CleintCall`을 생성할 때, 이전에 생성한 **executor**를 인자로 넘긴다. 생성된 `ClientCall` 또한 `ArmeriaClientCall` 이다.


~~~ java
ListenableFuture responseFuture = futureUnaryCall(call, req);
~~~
`futureUnaryCall`에 `CleintCall`과 `request data`를 전달하여 호출하면 grpc 전송을 시작하게 된다. 그리고 결과를 `ListenableFuture`로 반환한다.

~~~ java
while(!responseFuture.isDone()) {
    try {
        executor.waitAndDrain();
    } catch (InterruptedException var14) {
        interrupt = true;
        call.cancel("Thread interrupted", var14);
    }
}
~~~
`responseFuture`가 완료될때까지 `executor`의 `waitAndDrain`을 호출한다.

~~~ java
ThreadlessExecutor extends ConcurrentLinkedQueue<Runnable> implements Executor
~~~

참고로 `ThreadlessExecutor`는 `Queue`를 상속 받고 있어 `Queue`의 메소드를 그래도 사용할 수 있다. 그리고 **동기화가 구현**되어 있는 `waitAndDrain` 메소드를 살펴보면,

~~~ java
private static final class ThreadlessExecutor extends ConcurrentLinkedQueue<Runnable> implements Executor {
    private static final Logger log = Logger.getLogger(ClientCalls.ThreadlessExecutor.class.getName());
    private volatile Thread waiter;

    ...
    public void waitAndDrain() throws InterruptedException {
        ...
        this.waiter = Thread.currentThread();
        try {
            while((runnable = (Runnable)this.poll()) == null) {
                LockSupport.park(this);
                throwIfInterrupted();
            }
        } finally {
            this.waiter = null;
        }
        ...
    }
~~~
`waiter` 변수에 **현재 Thread를 설정**한다. `executor`에 `this.poll()`로 계속해서 검사를 하는데, 처음에는 당연히 아무것도 `Queue`에 `add` 하지 않았기 때문에 `null`이다. 때문에 **while**이 실행된다.
~~~ java
LockSupport.park(this);
~~~
`LockSupport.park`를 호출하면 호출한 쓰래드는 **block**이 된다. 참고로 다른 쓰래드에서 block된 쓰래드에 대해서 `LockSupport.unpark`를 해주면 block 상태에서 빠져나오게 된다.

**예상대로 grpc call 요청시 여기서 해어나오지 못했다. 즉, 쓰래드가 해제가 되지 않았다.**

그리고 `ThreadlessExecutor`에 **unpark**를 호출하는 메소드가 있다.
~~~ java
public void execute(Runnable runnable) {
    this.add(runnable);
    LockSupport.unpark(this.waiter);
}
~~~
`waiter`를 **volatile**로 선언된 이유가 여기에 있었다. 다른 Thread에서 `waiter`를 접근할때 Thread에 캐시된 상태가 아니라 현재 상태의 Thread를 바로 접근하기 위해서다. 

그리고 마침 **grpc-java github [issues](https://github.com/grpc/grpc-java/issues/3537)** 에서 다음과 같은 코멘트를 찾았다.
> Basically, once the first response comes in all runnables for the other calls are no longer processed since the blocking stub exits the processing loop on the ThreadlessExecutor.

음... 그래서 다음 요청들도 계속해서 행이 걸렸던 거다.

**결국 다른 쓰레드에서 `ThreadlessExecutor`의 `execute` 메소드를 실행해줘야 한다.**

좀더 자세히 알아보자.

<!-- ?? 생략? -->
`futureUnaryCall` 메소드가 호출되면 `ClientCall`이 **start**되는데
`ClientUtil.initContextAndExecuteWithFallback` 메소드를 통해서 `DefaultClientRequestContext`를 
**init** 한다. 
~~~ java
public class DefaultClientRequestContext extends NonWrappingRequestContext implements ClientRequestContext {
    public boolean init(Endpoint endpoint) {
        ...
        ReleasableHolder<EventLoop> releasableEventLoop = this.factory.acquireEventLoop(this.endpoint, this.sessionProtocol());
                this.eventLoop = (EventLoop)releasableEventLoop.get();
        ..
    }
    ..
}
~~~

이때 **EventLoop**를 `GrpcClientFactory`(`HttpClientFactory`)의 `DefaultExcutorScheduler`를 통해서 **EventLoop**를 하나 얻어와서 `ClientRequestContext`에 설정한다.

그리고 나서 전송을 `HttpClientDelegate`로 요청을 위임한다.

`HttpClientDelegate` 요청을 `excute` 시 `acquireConnectionAndExecute`를 통해 connection을 맺거나 가져와서 실행하게 된다.

여기서 **현재 Thread**와 **EventLoop Thread**가 같은지 검사를 한다.
~~~ java
private void acquireConnectionAndExecute(ClientRequestContext ctx, Endpoint endpointWithPort, String ipAddr, HttpRequest req, DecodedHttpResponse res, ClientConnectionTimingsBuilder timingsBuilder) {
    EventLoop eventLoop = ctx.eventLoop();
    if (!eventLoop.inEventLoop()) { // 같지 않다면
        eventLoop.execute(() -> {
            this.acquireConnectionAndExecute(ctx, endpointWithPort, ipAddr, req, res, timingsBuilder);
        });
    } else { // 같다면
        String host = extractHost(ctx, req, endpointWithPort);
        int port = endpointWithPort.port();
        SessionProtocol protocol = ctx.sessionProtocol();
        HttpChannelPool pool = this.factory.pool(ctx.eventLoop());
        PoolKey key = new PoolKey(host, ipAddr, port);
        PooledChannel pooledChannel = pool.acquireNow(protocol, key);
        if (pooledChannel != null) {
            this.doExecute(pooledChannel, ctx, req, res);
        } else {
            pool.acquireLater(protocol, key, timingsBuilder).handle((newPooledChannel, cause) -> {
                timingsBuilder.build().setTo(ctx);
                if (cause == null) {
                    this.doExecute(newPooledChannel, ctx, req, res);
                } else {
                    handleEarlyRequestException(ctx, req, cause);
                    res.close(cause);
                }

                return null;
            });
        }
    ...
}
~~~
같지 않다면, `acquireConnectionAndExecute`를 **EventLoop Thread**에서 실행하기 위해 **EventLoop Thread의 Task Qeue**에 **Task**(`acquireConnectionAndExecute`) 를 추가하고

같다면, 바로 `factory`에서 현재 **EventLoop**를 이용하여 `HttpChannelPool`을 가져와 **pooled된 channel**을 가져온다.
**pooled된 channel**이 있다면 해당 채널을 통해 전송이 진행되고, 없다면 `HttpChannelPool`에서 `acquireLater`를 통해 channel을 생성하고 channel이 연결 되었을 때 다시 전송을 시도하는 handler를 설정한다.

실제 channel은 **channel** `Bootstrap`을 통해 을 생성 된다.

~~~ java
public class Bootstrap extends AbstractBootstrap<Bootstrap, Channel> {
    ...
    private static void doConnect(final SocketAddress remoteAddress, final SocketAddress localAddress, final ChannelPromise connectPromise) {
        final Channel channel = connectPromise.channel();
        channel.eventLoop().execute(new Runnable() {
            public void run() {
                if (localAddress == null) {
                    channel.connect(remoteAddress, connectPromise);
                } else {
                    channel.connect(remoteAddress, localAddress, connectPromise);
                }

                connectPromise.addListener(ChannelFutureListener.CLOSE_ON_FAILURE);
            }
        });
    }
    ...
~~~
이 연결시도 또한 **EventLoop Task Qeue**에 추가가 된다.
그리고 나서 호출 스택을 빠져나와 `executor.waitAndDrain` 으로 빠지게 된다.

**결국 최초에 아무런 연결된 것이 없었기 때문에 연결을 시도하여 연결이 완료 되었을 경우 전송을 시작하는 Task가 EventLoop Qeue에 추가가 되고 executor.waitAndDrain이 호출 됬다. 그리고 현재 요청을 담당하는 Thread와 ClientRequestContext 설정시 얻어온 EventLoop가 같은 Thread였다.**

> 참고로 Netty에서 NioEventLoop (-> SingleThreadEventLoop -> SingleThreadEventExecutor)에서 EventLoop로 Task를 요청할때
>현재 Thread와 선택된 EventLoop Thread와 같다면 Task Queue에 추가만하게 된다. (현재 Thread가 EventLoop Thread기 떄문에 현재 처리하고 있는 Task에 이어서 다음 할일로 추가가 되는 것)

>현재 Thread와 선택된 EventLoop Thread가 다르다면 EventLoop Task Qeue에 Task를 추가하고 EventLoop Thread를 시작 시킨다. (즉, 현재 Thread에서 다른 EventLoop로 Task를 요청 후 실행 시킨다. -> 비동기로 실행)


**현재 Thread와 같은 Thread인 EventLoop Thread**의 **Task Queue**에 쌓이기만 하고 **park** 시키기 때문에 **Queue**에 쌓여 있는 **Task들은 실행되지 않는다.**
**그래서 연결조차 되지 않았고, 아무런 동작을 하지 않았다. 실제로 Task Queue에 테스크가 빠지지 않고 그대로 있는 상태로 해당 EventLoop Thread는 park 되었다.**

**결국, `blockingUnaryCall`을 비동기로 실행 시켜 동기화로 사용되는 `waiter(Thread.currentThread())`와 실제 요청에 사용되는 `Thread`가 다르게 하면 된다.**

~~~ java
subscribeOn(Schedulers.elastic())
~~~
**Reactor** 에서 기존으로 제공하는 `Scheduler` 중 **Blocking I/O**를 처리할 때 적합하다는 `Schedulers.elastic()`에서 처리 되도록 요청하는 Mono stream에 추가 해 주었다. ([공식문서](https://projectreactor.io/docs/core/release/reference/#faq.wrap-blocking)) 그래서 `armeria-common-worker-nio-*`가 아닌 `elastic-*`에서 동기화가 이루어 진다.

추가한 뒤로는 아무 문제 없이 잘 동작했다.

혹시 Blocking 로직이 있을 경우 내부 로직을 살펴볼 필요가 있다. 혹은 Blocking은 되도록 사용하지 말자.

> 그리고 참고로 unpark하는 메소드는 `ArmeriaClientCall`에서 요청에대한 Response가 도착하여 `messageRead`하고 나서 호출 된다.
