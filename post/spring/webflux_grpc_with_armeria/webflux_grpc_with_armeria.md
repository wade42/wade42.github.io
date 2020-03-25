# Webflux로 gRPC 지원하기 (with Armeria)  (feat. Eureka)

플랫폼 서비스 특성상 API를 지원할때 `HTTP/S` 뿐만 아니라 `gRPC`도 제공하게 되었다. 사용자로 하여금 다양하게 접근하여 사용할 수 있도록 하기 위함이고 적은 리소스로 많은 요청을 처리 하고 더 적은 latency를 제공할 수 있었다.

`Webflux`를 선택한 이유중 하나가 `Armeria`와 연동하여 `gRPC`를 쉽게 제공할 수 있고, `Armeria`에서 제공하는 기능 (`gRPC`, `Thrift`, `api docs`, `example` 등등)을 동시에 제공하며 시너지를 낼 수 있었다.


> Armeria를 이용하면 정말 쉽게 gRPC 까지 지원 가능하다.

먼저 준비해야 할사항으로 **protobuf 설치**와 **java grpc 플러그인**이 필요하며 **proto** 파일을 작성해야 한다.

 작성 후 설치한 protobuf를 이용해 `Messge Class`로 compile 하고 java grpc 플러그인을 이용해서 `Grpc Service Class`로 compile 한다. 
 
 > 참고로 Grpc Service를 이용해서 Stub를 생성해 통신하게 된다.

그리고 `Grpc Service`의 `ImplBase`를 **상속**받아 메소드를 구현 한다. 

## Server Configuration
~~~ java
@Bean
public ArmeriaServerConfigurator armeriaServerConfigurator() {
    final User.UserNumberRequestOrBuilder exampleNumberRequest = User.UserRequest.newBuilder().setNumber("test").build();

    return  builder -> {
        builder.service(GrpcService.builder()
                .addService(userService)
                // gRPC CLI를 통해 protobuf 정보 제공
                .addService(ProtoReflectionService.newInstance())
                // grpc-web, http/json 등 다양한 포맷 지원
                .supportedSerializationFormats(GrpcSerializationFormats.values())
                // for http json
                // frame 형식이 아닌 형태로도 지원하기 위함
                // 해더에 타입(application/json; charset=utf-8; protocol=gRPC)만 추가 하면 http post로 요청 가능
                .enableUnframedRequests(true)
                .build(),
                // 로깅 설정
                LoggingService.newDecorator()
            )
            .serviceUnder("/docs", new DocServiceBuilder()
                    .exclude(DocServiceFilter.ofServiceName(ServerReflectionGrpc.SERVICE_NAME))
                    .build()
            );
    };
}
~~~
구현한 `Service`를 `Builder`에 추가 해준다. 그리고 `gRPC` 관련 `ArmeriaServer` 설정을 추가 해준다.

참고로 **webflux-armeria depencency**를 추가하면 `ArmeriaReactiveWebServerFactoryAutoConfiguration`에의해 `ArmeriaReactiveWebServerFactory`가 빈으로 등록되고 `ArmeriaWebServer`가 구동된다. 위와 같이 `ArmeriaServerConfigurator`를 빈에 등록하면 해당 `Configurator`를 참조하여 `ArmeriaWebServer`를 구동한다. 

> [Armeira 설정 공식문서](https://line.github.io/armeria/advanced-spring-webflux-integration.html)

> Armeria를 활용했는 글중 Slack에서 gRPC와 Thrift가 따로 있던 서버들을 Armeria를 사용해서 통합 했다고 한다. ([gRPC Conf 글](https://grpconf19.sched.com/event/L715/grpc-for-the-thrifty-grpc-at-slack-josh-wills-slack))

## Client Request
gRPC Server로 요청을 보내는 방법은 두가지가 있다.

* **HTTP 1.1**
* **Stub**

### HTTP 1.1 요청
`gRPC`는 `HTTP2` 통신이기 때문에 **Frame** 단위로 통신한다. 때문에 **Frame** 단위 통신이 아닌 요청도 Server에서 지원해줘야 한다.
~~~ java
.enableUnframedRequests(true)
~~~
다음 옵션을 Server를 Build 할때 추가 하여 지원이 가능하다. 그리고 Client에서 요청을 보낼시 요청 **Header**의 **Content-Type**에 `application/json; charset=utf-8; protocol=gRPC` 를 추가 해서 요청해야 한다.

###  Stub 통신
**protobuf**와 **java grpc** 플러그인을 이용하여 compile한 `Grpc Service Class`에는 `Stub`들도 함께 들어있다. 그리고 `Stub` 또한 3가지가 있다.

* **BlockingStub**
* **AsyncStub**
* **FutureStub**

공통적으로 `Clients.newClient` 또는 `ClientBuilder`를 통해 인자로 념겨진 `Stub Class Type`에 따라 `Stub`가 생성이 되는데, 이때 사용되는 `Armeria`의 `ClientFactory`는 `GrpcClientFactory`다. `GrpcClientFactory`를 살펴보면 `Stub`에서 사용되는 `HttpClient`와 `Channel`들을 볼 수 있다.

#### BlockingStub
요청 후 응답을 받을때 까지 요청 Thread에 **Lock**을 거는 방식으로 Bocking Call이 구현되어 있다.

~~~ java
// Clients.newClient
UserServiceGrpc.UserServiceBlockingStub userServiceStub 
                = Clients.newClient("gproto+http://group:" + groupName + "/", UserServiceGrpc.UserServiceBlockingStub.class);

// Builder
UserServiceGrpc.UserServiceBlockingStub userServiceStub
                = new ClientBuilder("gproto+http://group:" + groupName + "/")
                    .decorator(LoggingClient.newDecorator())
                    .build(UserServiceGrpc.UserServiceBlockingStub.class);
~~~
`ClientOptions`를 설정하는 방식만 다르고 동일하다. 만약 `decorator`를 사용한다면 `Builder` 방식을 추천한다.

~~~ java
// request build
User.UserRequest request = User.UserRequest.newBuilder().setName("cho").build();
// request 요청
User.UserReply reply = userServiceStub.hello(request);
// get reply data
reply.getMessage(); 
~~~
`request` 객체 빌더를 이용하여 객체를 생성 후 `Stub`의 **rpc method**를 통해 전송한다.

#### AsyncStub
생성 부분은 동일하다.
~~~ java
// Clients.newClient
UserServiceGrpc.UserServiceStub userServiceStub 
                = Clients.newClient("gproto+http://group:" + groupName + "/", UserServiceGrpc.UserServiceStub.class);

// Builder
UserServiceGrpc.UserServiceStub userServiceStub
                = new ClientBuilder("gproto+http://group:" + groupName + "/")
                    .decorator(LoggingClient.newDecorator())
                    .build(UserServiceGrpc.UserServiceStub.class);
~~~
`Stub Class Type`을 이용하여 build 한다.

~~~ java
// Response StreamObserver
UserRegisterGrpc.Empty empty = UserRegisterGrpc.Empty.newBuilder().build();

// 응답이 왔을 때 실행되는 StreamObserver
StreamObserver<UserRegisterGrpc.UserCampaignReply> campaignReply = new StreamObserver<UserRegisterGrpc.UserCampaignReply>() {
    @Override
    public void onNext(UserRegisterGrpc.UserCampaignReply userCampaignReply) {
        System.out.println(userCampaignReply.getUserId());
    }

    @Override
    public void onError(Throwable throwable) {
        System.out.println("error");
        System.out.println(throwable.getMessage());
    }

    @Override
    public void onCompleted() {
        System.out.println("Completed");
    }
};

// request 요청 및 응답 Stream 등록
targetingStub.register(empty, campaignReply);
~~~
`BlockingStub`와 다르게 요청 후 응답이 왔을 때 실행되는 `StreamObserver`가 필요하다. 그리고 `Stub`의 **rpc method**를 호출할 때 `request` 객체와 함께 전달한다.

#### FutureStub
생성 부분은 역시 동일하다.

~~~ java
UserServiceGrpc.UserServiceFutureStub userServiceStub 
                = Clients.newClient("gproto+http://group:" + groupName + "/", UserServiceGrpc.UserServiceFutureStub.class);

// Builder
UserServiceGrpc.UserServiceFutureStub userServiceStub
                = new ClientBuilder("gproto+http://group:" + groupName + "/")
                    .decorator(LoggingClient.newDecorator())
                    .build(UserServiceGrpc.UserServiceFutureStub.class);
~~~
`Future Stub Class Type`을 이용하여 build 한다.

~~~ java
// request build
User.UserRequest request = User.UserRequest.newBuilder().setName("cho").build();
// request 요청 후 ListenableFuture를 반환한다.
ListenableFuture<User.UserReply> replyFuture = userServiceStub.hello(request);
replyFuture.get();
~~~
`Stub`의 **rpc method**를 호출하면 `ListableFuture`를 반환한다. `get` 또는 `listener`를 등록하여 사용한다.

## LoadBancing
`Armeria`에서 **Client-side load balancing**을 지원 한다.
~~~ java
EndpointGroupRegistry.register("Statistics", EndpointGroup.of(Endpoint.of("172.17.0.1", 8080), Endpoint.of("172.17.0.2", 8080)), EndpointSelectionStrategy.ROUND_ROBIN);
~~~
`Endpoint`들로 `EndpointGroup`을 생성한다. 그리고 `EndpointGroupRegistry`에 **name**과 함께 등록 할수 있다.
그리고 `WebClient` 또는 `Stub` 생성시 **URi**에 `프로토콜://group:{groupName}` 으로 설정하면 자동으로 `Endpoint`들이 **load balancing** 된다.

> EndpointGroup 사용시 HealthCheckedEndpointGroup을 사용하면 Netflix의 Ribbon 처럼 health check 후 Endpoint를 반환한다.

## Discovery
Sevice를 제공하는 서버(Resource)가 항상 고정이라면 상관 없겠지만 **Reative System**에서는 **동적**이다. 때문에 **Service Discovery**가 필요한데 `Armeria`에서는 **DNS-based service discovery** 와 **ZooKeeper-based service discovery**를 지원한다.

사실 `Zookeeper`를 구축하여 단순히 `node`를 기록 함으로써 간단하게 Service Discovery 처럼 사용 할 수 있지만, 더 기능이 많고 간단하게 사용할 수 있는 **Eureka**를 사용했다.

하지만 `Armeria`와 **Eureka**를 현재는 연동할 수 없으며, **Eureka**에서 서버 정보를 일정 주기 동기화 해주는 **스케쥴러**를 만들어야 한다. 동기화 부분은 RxJava 또는 Reactor의 Operator들을 통해서 쉽게 만들 수 있다.
> couchbase client library에서 XDCR 연결이나 Kafka Connection retry시 같은 방법을 이용했다.

~~~ java
// 예시코드. 
@Bean
public AuthServiceGrpc.AuthServiceBlockingStub authGrpcClient(@Value("${eureka.client.auth.application-name}") String authEurekaName) {
    // get and register endpoint
    registerEurekaApplication(authEurekaName);
    // sync
    syncEurekaClient(authEurekaName);

    AuthServiceGrpc.AuthServiceBlockingStub authServiceStub = new ClientBuilder("gproto+http://group:" + authEurekaName + "/")
            .decorator(LoggingClient.newDecorator())
            .build(AuthServiceGrpc.AuthServiceBlockingStub.class);

    return authServiceStub;
}
~~~
**Eureka**에서 `ServerList`를 받아와 `EndpointGroupRegistry`에 등록 후 일정주기로 **Eureka**에서 `ServerList`를 받아와 변경사항이 있는 경우에만 `EndpointGroup`을 변경하는 스케쥴러를 동작시킨 후 `Stub`를 만들어 빈으로 등록 하게 했다.