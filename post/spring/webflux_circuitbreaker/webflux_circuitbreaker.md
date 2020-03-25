# Webflux(Reactor) CircuitBreaker 추가 (with Resilience4j)
## Resilience4j를 사용한 이유

일단 Netflix Hystrics를 사용하지 않은 이유는, 더 이상 개발하지 않으며 현재 버전으로 유지되고 있다.

Reilience4j는 무엇보다도 Reactor 및 RxJava에 손쉽게 연동이 가능하다.
(Reactive Streams Operators가 구현되있어 Operator Pipeline 연결이 가능하다.)

Spring, Webflux 뿐만아니라 Couchbase Library를 사용하는 경우, Akka를 사용하는 경우 에도 모두 사용이 가능하다.
그리고 gRPC 사용시에도 적용할 수 있었다. 즉, 어떠한 Library나 Framework와 관련없이 적용이 쉽게 가능하다.

## 준비
`CircuitBreaker` 객체를 생성하기 위해서는 먼저 해당 `CircuitBreaker`의 설정이 담기는 **Config**와 Event를 등록하는 **Registry** 두가지를 생성해야 한다.


### Config
~~~ java
CircuitBreakerConfig.custom()
~~~
`Builder` 객체를 이용해서 `Config` 객체를 생성한다.

~~~ java
    // 성공률이 70% 이하가 되면 Circuitbreaker 상태를 Open이 된다.
    .failureRateThreshold(70)
    // 5초뒤 open 상태 초기화
    .waitDurationInOpenState(Duration.ofMillis(5000))
    // open 상태의 call buffer max 수
    .permittedNumberOfCallsInHalfOpenState(10)
    // call buffer 수
    .slidingWindowSize(100)
    // 기록 전 최소 call 수치
    .minimumNumberOfCalls(10)
~~~
method chain으로 수치 설정을 한다.

~~~ java
    .recordExceptions(IOException.class, TimeoutException.class,
        StatusRuntimeException.class, // grpc connection error
        DataAccessResourceFailureException.class // DB
    )
    .build();
~~~
설정된 `Exception Type`들만 기록이 된다. 그리고 `build`를 통해 `CircuitBreakerConfig` 생성한다.

> config에 대한 자세한 설명과 Type에 따른 내부 동작을 알고 싶다면 [다음 글]()을 참고 한다.

### Registry
~~~ java
CircuitBreakerRegistry circuitBreakerRegistry = CircuitBreakerRegistry.of(customCircuitBreakerConfig);

circuitBreakerRegistry.getEventPublisher().onEntryAdded(entryAddedEvent -> {
    CircuitBreaker addedCircuitBreaker =  entryAddedEvent.getAddedEntry();
    log.info("CircuitBreaker {} added", addedCircuitBreaker.getName());
    addedCircuitBreaker.getEventPublisher().onEvent(circuitBreakerEvent -> 
        log.info("event: {}", circuitBreakerEvent.toString())
    );
})
.onEntryRemoved(entryRemovedEvent -> {
    CircuitBreaker removedCircuitBreaker = entryRemovedEvent.getRemovedEntry();
    log.info("CircuitBreaker {} removed", removedCircuitBreaker.getName());
});
~~~
설정한 `CircuitBreakerConfig`을 가지고 `CircuitBreakerRegistry`를 만들고 registry에 `CircuitBreaker`가 **등록**, **제거** 되었을 때 로그를 남기는 **Event**를 등록한다.

`Event`를 등록하는 부분을 좀더 자세히 보면
~~~ java
CircuitBreaker addedCircuitBreaker =  entryAddedEvent.getAddedEntry();
        log.info("CircuitBreaker {} added", addedCircuitBreaker.getName());
        addedCircuitBreaker.getEventPublisher().onEvent(circuitBreakerEvent -> 
            log.info("event: {}", circuitBreakerEvent.toString())
        );
~~~
그리고 `Circuitbreaker`에서 발생하는 모든 Event를 등록할 수있다. 위에서는 Registry에 추가되었을 경우에 `Circuitbreaker`에 로깅하는 `Event`를 추가하였다.

~~~ java
CircuitBreaker addedCircuitBreaker = circuitBreakerRegistry.circuitBreaker("couponBreaker", customCircuitBreakerConfig);
addedCircuitBreaker.getEventPublisher().onEvent(circuitBreakerEvent -> log.info("event: {}", circuitBreakerEvent.toString()));
~~~
`entryAddedEvent`에서 등록되게 하는것이 아니라 생성한 `Circuitbreaker` 객체에 접근해서 등록 해도 된다.

`CircuitbreakerEvent`는 다음과 같은 `Event Type`을 가지고 있다.

~~~ java
public static enum Type {
    ERROR(false),
    IGNORED_ERROR(false),
    SUCCESS(false),
    NOT_PERMITTED(false),
    STATE_TRANSITION(true),
    RESET(true),
    FORCED_OPEN(false),
    DISABLED(false);

    ...
}
~~~
`onEvent`메소드에서 전달되는 `CircuitBreakerEvent`객체를 통해 Type별로 Event를 분기 시킬수 있다.

`circuitBreakerEvent.toString()` 으로 로깅했을 경우에는 `Circuitbreaker`의 **state**와 **elapse time**이 출력된다.

~~~ java
CircuitBreaker gatewayCircuitBreaker = circuitBreakerRegistry.circuitBreaker("gatewayBreaker", customCircuitBreakerConfig);
~~~
그리고 `CircuitBreakerRegistry`와 `CircuitBreakerConfig` 통해서 `CircuitBreaker`를 생성하고 **Bean**에 등록하여 사용한다. 

제공하고자 하는는 API별로 설정값을 다르게 하여 여러개의 `CircuitBreaker`를 생성 및 등록 후 용도에 따라 사용하면 된다.
참고로 이 `CircuitBreaker`객체에 수치가 기록되고 누적된다.

## 적용하기
생각보다 `Reactor`나 `RxJava`에서는 사용하기가 정말 간단하다. 그외 다른 환경에서 사용하고 싶다면 [공식 홈페이지]()를 참조하면 여러가지 사용법이 나와있다.
~~~ java
.transformDeferred(CircuitBreakerOperator.of(gatewayBreaker))
~~~
`Reactor Stream` 중간에 `CircuitBreakerOperator`를 통해 `CircuitBreaker Stream`을 추가 한다.
> 참고로 compose 메소드는 deprecate 되었고 메소드 명이 transformDeferred로 바뀌었다. [github issue](https://github.com/reactor/reactor-core/issues/1745)


#### 그럼 저 Operator 하나 추가만 하면 되는데... 어떻게 동작 되는걸까? 
생각보다 내부 동작은 간단(?)하다. 
> Reactor에 대한 더 자세한 설명은 [여기]()를 참고.

`Reactor`의 `Operator`는 임의의 **Publisher**이며 **Decorating** 역할을 한다. 그리고 각 `Operator` 클래드들과 연관된각 **Subscriber** 클래스 들이 `React core`에 정의가 되어 있다. 
> 하나의 예로 map 의 Operator 클래스는 MonoMap 이며 Subsriber 클래스는 MapSubscriber이다.

`Reactor`를 사용할때 보통 메소드 chaining으로 `Operator` 메소드에 람다를 전달하며 작성 하게된다. 이때 마다 **Operator** 객체들이 **생성**되고 **반환**된다.

그리고 `subscrib`가 호출 될때 **upstream(Subscriber)** 과 **downstream(Subscriber)** 의 **조립(연결)** 작업이 시작된다. 하나의 Stream으로 조립 작업이 끝나면 upstream에서 downstream으로 연결된 subscriber들이 실행되게 된다.


`CircuitbreakerOperator`는 **Reactor**의 **Operator**와 **Subscriber**를 **구현**한 클래드스들을 포함하는 클래스로 `Reactor Core Operator`들과 연결 가능하게 되어 있다.

~~~ java
class CircuitBreakerOperator<T> implements UnaryOperator<Publisher<T>> {
    ...
    public static <T> CircuitBreakerOperator<T> of(CircuitBreaker circuitBreaker) {
        return new CircuitBreakerOperator(circuitBreaker);
    }

    public Publisher<T> apply(Publisher<T> publisher) {
        if (publisher instanceof Mono) {
            return new MonoCircuitBreaker((Mono)publisher, this.circuitBreaker);
        } else if (publisher instanceof Flux) {
            return new FluxCircuitBreaker((Flux)publisher, this.circuitBreaker);
        } else {
            throw new IllegalPublisherException(publisher);
        }
    }
}
~~~
`CircuitbreakerOperator`는 `transformDeferred  Operator` 메소드의 인자로 넘겨지는 함수의 구현체이고
> transformDeferred안에서 apply가 호출 된다.

~~~ java
class MonoCircuitBreaker<T> extends MonoOperator<T, T>
class FluxCircuitBreaker<T> extends FluxOperator<T, T>
~~~
`CircuitbreakerOperator`로 전달되는 상위 `Publisher Type`에 따라서 `MonoCircuitBreaker`, `FluxCircuitBreaker`가 생성된다. 그리고 이 두 클래스가 **Operator (Publisher)** 이고
**Subscribe** 메소드가 구현되어 있다. 두 클래스 모두 로직은 동일하다.

~~~ java
class MonoCircuitBreaker<T> extends MonoOperator<T, T>
...
    public void subscribe(CoreSubscriber<? super T> actual) {
        if (this.circuitBreaker.tryAcquirePermission()) {
            this.source.subscribe(new CircuitBreakerSubscriber(this.circuitBreaker, actual, true));
        } else {
            Operators.error(actual, CallNotPermittedException.createCallNotPermittedException(this.circuitBreaker));
        }

    }
    ...
}
~~~
**구독될때 (조립될때)** 인자로 넘겨진 `Circuitbreaker`의 `tryAcquirePermission` 메소드로 현재 `Circuitbreaker`의 
**StateReference**를 **Check** 후 **Subscriber(CircuitBreakerSubscriber)** 를 설정한다. 인자로 받는 `actual`은  **downstream** 이다.
> 어떻게 permission을 얻어오는지는 자세히 알고 싶다면 [여기]() 참고

~~~ java
class CircuitBreakerSubscriber<T> extends AbstractSubscriber<T>
    ...
    protected void hookOnNext(T value) {
        if (!this.isDisposed()) {
            if (this.singleProducer && this.successSignaled.compareAndSet(false, true)) {
                this.circuitBreaker.onSuccess(System.nanoTime() - this.start, TimeUnit.NANOSECONDS);
            }

            this.eventWasEmitted.set(true);
            this.downstreamSubscriber.onNext(value);
        }

    }
    ...
    protected void hookOnComplete() { ...
    public void hookOnCancel() { ...
    protected void hookOnError(Throwable e) { ...
}
~~~
`CircuitBreakerSubscriber`는 **upstream**에서 **value**를 전달 받으면 `Circuitbreaker`에 **기록**하고 **value**를 그대로 **downstream**으로 전달한다.

때문에 `CircuitebreakerOperator`를 `Stream` **어느 위치에 추가할 것인지가 중요하다**. 추가한 위치를 기준으로 **upstream**들에서 **success** 또는 **error**가 `Circuitbreaker`에 **기록, 허용** 및 **차단**이 될 것이고 **downstream**에서 일어난 일들은 **기록되지 않는다**.

참고로 `MonoCircuitBreaker`의 `Operator`에서 보면 **permission을 획득 하지 못하면** 
~~~ java
CallNotPermittedException.createCallNotPermittedException(this.circuitBreaker));
~~~
`Exception`이 발생하게 되어 있다.

~~~ java
io.github.resilience4j.circuitbreaker.CallNotPermittedException: CircuitBreaker 'gatewayBreaker' is OPEN and does not permit further calls
~~~
실제로 다음과 같이 로그가 출력된다.

~~~ java
.onErrorResume(CallNotPermittedException.class, e -> ServerResponse.status(HttpStatus.BAD_REQUEST).bodyValue("coupon breaker is open"))
~~~
때문에 다음과같이 **Error**를 대응해 주면 된다.

~~~ java
return Mono.just(deviceInfo)
        .doOnNext(deviceValidator::validate) // pc 인지 mobile 인지 검사
        .map(d -> userValidator.validate(id, name))
        .flatMap(userService::getUserInfo)
        .flatMap(g ->
            Mono.just(g)
                // server1 수행
                .flatMap(gc -> userService.server1(gc, deviceInfo))
                .flatMap(al -> Mono.just(al)
                    // server2 수행
                    .flatMap(userService::server2)
                    // server3 수행
                    .flatMap(ad -> userService.server3(g, deviceInfo, al, ad))
                )
        )
        .transformDeferred(CircuitBreakerOperator.of(gatewayBreaker))   <-- 추가
        .flatMap(a -> ServerResponse.status(HttpStatus.OK).bodyValue(a))
        .onErrorResume(ServerWebInputException.class, e -> ServerResponse.status(HttpStatus.BAD_REQUEST).bodyValue(e.getReason()))
        .onErrorResume(CallNotPermittedException.class, e -> ServerResponse.status(HttpStatus.BAD_REQUEST).bodyValue("coupon breaker is open"))
        .onErrorResume(Exception.class, e -> ServerResponse.status(HttpStatus.INTERNAL_SERVER_ERROR).bodyValue(e.getMessage()))
~~~

최종적으로 실제로 사용된 `RouterHandlerFunction`의 예시이다. 

추가된 지점을 기준으로 upstream에서 일어난 결과들을 기록 할 것이고 중간에 하나라도 실패 된다면 (CircuitBreaker 가 Open 상태가 된다면) api는 실패로 간주 한다.