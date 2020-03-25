# Zuul2 내부 구조 및 동작 (사용기)
### Zuul1 vs Zuul2
사실 Spring Cloud Zuul이 사용하기에는 정말 편하다. 하지만 Zuul1은 blocking 방식이고 Http2를 지원하지 않으며 성능의 한계가 있다. Zuul2는 netty(non-blocking)를 기반으로 동작하기 때문에 성능 차이가 확연히 많이났다. 사실 다른 것들은 크게 이유가 되지 않을 수 있지만, 성능 차이와 동적 properties, filter 변경, vip별 동시성 처리 조절이 가장 컸다.

> 참고: [Zuul2 개발자의 발표 자료](https://www.slideshare.net/artgon/zuuls-journey-to-nonblocking)


처음 베타버전 일때 소스코드를 빌드를 해서 정식 버전이 나올때 까지 사용하였는데 이미 성능은 만족 스러웠다. 단지 불편한 점은 불필요한 설정들은 소스코드를 직접 찾아야 했다. 초기 정식 버전보다 지금은 성능 관련 설정들이 많아 져서 훨씬 다루기 쉬워졌다.

그리고 무엇보다 API Gateway 도입함으로써 서비스들을 분리할 수 있었고 Gateway틑 통해서 신규 API와 레거시 API를 통합하고 쉽게 제거할 수 있었다. 그리고 공통 기능(인증) 및 Tracking을 위한 log key를 발급 하기 위한 용도로 도 사용하였다.

주관적으로 생각보다 좋았던건, log key 발급과, 인증 기능을 각서비스서 분리 할수 있어서 좋았다.

> 기존에는 인증 기능이 각 서버마다 사용하고 있었다. Gateway를 도입하면서 인증 Library 관련 의존도를 제거 할 수 있었고, 때문에 인증 Library로 인해서 서버를 재시작 할일은 없었다.

주의해야 할 점은, 하나의 API Gateway로 많은 서비스들이 몰리게 되면 API Gateway가 상당히 커질 위험이 있으므로 적절히 분리 해야 한다. 그리고 Zuul2는 Http2를 지원 하지만 gRPC는 아직 지원하지 않는다. 또 내부적으로 사용하는 알아야할 Framework나 Library들이 많다.


## Framework 구성
**Dependency Injection Framework**는 **Google Guice**를 바탕으로 **Netflix Govenator**를 함께 사용하고 

**Network Framework**는 **netty**,

**LoadBalancing Library**는 **Netflix Ribbon**,

**Configuration Management**로는 **Netflix Archaius**,

**Service Discovery**로 **Netflix Eureka**,

**In/Out Bound Filter**에는 **Groovy**,

그리고 내부적으로 **RxJava** 등을 사용하고 있다.

## 동작 과정
Zuul1과 내부 동작은 다르겠지만 흐름은 거의 동일하다.

Zuul1에서는 `Pre Filter`와 `Post Filter`였다면 Zuul2에서는 `Inbound Filter`와 `Outbound Filter`이다.

> zuul2의 Filter는 동적으로 반영하기 위해서 Groovy로 작성된다.

* **Request**

`Request` -> **Gateway Server** -> **Inbound Filter** -> **Origin Server**

* **Response**

**Origin Server** -> **Gatway Server** -> **Outbound Filter** -> `Response`

Gateway로 요청이 도착하면 정해진 Inbound Filter들을 실행 되고 Origin Sever로 요청을 전달한다. 그리고 Origin Server의 응답을 받아 Outbound Filter를 거쳐 요청자에게 다시 응답을 보낸다.


## 내부로 들어가보자. (사용하기)
이해하기 전에 어떤 Library들이 어떤 역할을 하는지 확인하고 보면 Application 설정할때 이해가 쉽다.

> 빠르게 구성하는 방법은 [zuul-sample](https://github.com/Netflix/zuul/tree/master/zuul-sample)을 받아 사용한다.

다음은 Zuul2를 사용하기 위해서 알아둬야 하는 것들이다.

### Bootstrap
실제로 **Application을 구동하는 Class**이다.

Application이 시작되면 설정 부터 읽는다.
~~~ java
ConfigurationManager.loadCascadedPropertiesFromResources("{propertiesFileName}");
~~~
**properties**를 `Archaius`에 등록한다.

~~~ java
Injector injector = InjectorBuilder.fromModule(new ZuulModule()).createInjector();
~~~
그리고 **Dependency Binding 정보**가 담겨있는 **Google Guice Module**을 로딩한다. `injector`로 `instance`를 생성 및 주입할때 참고되는 정보이다.

~~~ java
BaseServerStartup serverStartup = injector.getInstance(BaseServerStartup.class);
Server server = serverStartup.server();
server.start(true);
~~~
`BaseServerStartup Type`의 `ServerStartup` 객체를 생성하고 `Server` 객체를 통해 서버가 시작된다.

### ServerStartup
`BaseServerStartup`를 구현한 Class로 `Service Type`을 설정한다.

현재 **zuul2(2.1.6)** 은 다음과 같은 `Service Type`을 지원한다.
~~~ java
enum ServerType {
    HTTP,
    HTTP2,
    HTTP_MUTUAL_TLS,
    WEBSOCKET,
    SSE
}
~~~

기본적으로는 `SERVER_TYPE` 변수에
~~~ java
private static final ServerType SERVER_TYPE = ServerType.HTTP;
~~~
**HTTP**로 설정되어 있고, 다른 Type의 서비스를 제공하고 싶다면 `SERVER_TYPE`을 변경하면 된다.


`ServerStartup`는 `BaseServerStartup`을 상속 받아 `chooseAddrsAndChannels` 메소드를 **override**한다. `chooseAddrsAndChannels` 메소드는 `Service Type`을 정하고, 정해진 Type에 맞게 **Netty Channel Config**을 반환하는 메소드이다. `ServerStartup`가 초기화 될때 호출되며 이 **Config**로 `Server`를 생성한다. 그리고 `Bootstrap`에서 `Server`의 **start** 메소드에 의해 서버가 시작된다.

> Constructor에 Inject되는 실제 Class들이 보고 싶다면 xxxModule Class를 확인하면 어떤 Class들이 binding 되는지 확인 할 수 있다. (Google Guice 참고)

> ServerStartup 클래스는 sample 프로젝트를 참고해서 작성 하면된다. 불필요 한 설정들은 주석 처리하는 것을 추천한다.


### ChannelHandler
`Zuul2`는 `netty`기반으로 구현되어 있다. 참고로 `netty`는 `ChannelInitilalizer`를 통해 `Channel Pipeline`에 **Event Handler**들을 등록하고, **등록 순으로 동작**하게 되어있다. 이 말은 `Zuul2`도 `ChannelInitilalizer`들이 있다는 얘기다.
`chooseAddrsAndChannels` 메소드에서 `Service Type`별로 **Config**를 만들어 낼때 `Service Type`에 맞는 `ChannelInitializer`도 셋팅된다.


* HTTP => ZuulServerChannelInitializer
* HTTP2 => Http2SslChannelInitializer
* HTTP_MUTUAL_TLS => Http1MutualSslChannelInitializer

위 `ChannelInitializer`들도 미리 구현되어 있으며 가져다 사용하기만 하면된다. 사실상 내부 **process의 핵심**이다.

#### ZuulServerChannelInitializer
참고로 `Http Channel Initializer`들은 `BaseZuulChannelInitializer`를 상속 받고 있고 구조는 모두 비슷하다. 그리고 내부를 보면 어마어마한 **Handler**들이 들어있다.

~~~ java
protected void initChannel(Channel ch) throws Exception {
    ChannelPipeline pipeline = ch.pipeline();
    this.storeChannel(ch);
    this.addTimeoutHandlers(pipeline);
    this.addPassportHandler(pipeline);
    this.addTcpRelatedHandlers(pipeline);
    this.addHttp1Handlers(pipeline);
    this.addHttpRelatedHandlers(pipeline);
    this.addZuulHandlers(pipeline);
}
~~~
`ChannelPipeline`에 **Event Handler**를 등록하는 과정이다. 보통 `Application`에 사용되는 **config**, **properties**, **logging 정보**들은 **channel attribute를 이용해서 다음 Handler로 전달되고, 꺼내서 사용되고, 다시 저장된다.**

메소드 명만봐도 어떤 `Handler`들이 설정되어 있는지 어느정도는 알 수 있다. 

이중에서 한가지 **짚고 넘어가야할 handler**는 `PassportHandler`로, 요청의 **내부 동작 Tracking** 용도이다. `addPassportHandler` 메소드에서 `Pipeline`에 추가된다.

~~~ java
this.history.addLast(new PassportItem(state, this.now()));
~~~

내부적으로 `PassportItem` 라는 객체를 **Handler 단계 별**로 `List`에 누적 시키면서 **hisotry**를 간직하다가, 문제가 생겼을 때나, 디버깅 시에 **누적된 history를 로그로 출력**시킨다. 

~~~ java
CurrentPassport {start_ms=1523578203359,
[+0=IN_REQ_HEADERS_RECEIVED,
+260335=FILTERS_INBOUND_START,
+310862=IN_REQ_LAST_CONTENT_RECEIVED,
+1053435=MISC_IO_START,
+2202112=MISC_IO_STOP,
+3917598=FILTERS_INBOUND_END,
+4157288=ORIGIN_CH_CONNECTING,
+4218319=ORIGIN_CONN_ACQUIRE_START,
+4443588=ORIGIN_CH_CONNECTED,
+4510115=ORIGIN_CONN_ACQUIRE_END,
+4765495=OUT_REQ_HEADERS_SENDING,
+4799545=OUT_REQ_LAST_CONTENT_SENDING,
+4820669=OUT_REQ_HEADERS_SENT,
+4822465=OUT_REQ_LAST_CONTENT_SENT,
+4830443=ORIGIN_CH_ACTIVE,
+20811792=IN_RESP_HEADERS_RECEIVED,
+20961148=FILTERS_OUTBOUND_START,
+21080107=IN_RESP_LAST_CONTENT_RECEIVED,
+21109342=ORIGIN_CH_POOL_RETURNED,
+21539032=FILTERS_OUTBOUND_END,
+21558317=OUT_RESP_HEADERS_SENDING,
+21575084=OUT_RESP_LAST_CONTENT_SENDING,
+21594236=OUT_RESP_HEADERS_SENT,
+21595122=OUT_RESP_LAST_CONTENT_SENT,
+21659271=NOW]}
~~~
> 참고: [Request Passport](https://github.com/Netflix/zuul/wiki/Core-Features#request-passport)

**State**와 **수행시간**이 기록되기 때문에 오래 걸리는 **Handler 단계**를 찾을 수 있다. 

그리고 가장 중요한 `ZuulFilter`를 등록하는 `addZuulHandlers` 이다. 이 메소드에서 작성한 **inbound, outbound filter를 ChannelPipeline에 등록**한다.

~~~ java
this.addZuulFilterChainHandler(pipeline);
~~~

`FilterLoader`를 통해 `FilterRegistry`에 로드되어 있는 `Filter`들을 `Type`(`Inbound` 또는 `OutBound`)에 따라 가져온다.
`FilterLoader`에서 `Filter`들을 가져올때 설정된 **order**로 정렬된 **List**로 반환된다. 그리고 `Filter`는 정렬된 순으로 실행된다.
오름 차순으로 정렬 되기 때문에 `Filter`는 **order가 낮을 수록 우선순위가 높다**.

**List**로 가져온 `Inbound Filter`과 `Outbound Filter`는 각각 `ZuulFilterChainRunner`로 만들어진다.


그리고 만들어진 각 `ZuulFilterChainRunner`를 이용하여 **ZuulFilterChainHandler**를 만들고, 이 **Handler**를 **가장 마지막 Handler로 ChnaelPipeline에 등록**된다.

잠시 `ZuulFilterChainHandler`의 실행과정을 살펴 보면

`Inbound Filter List`(**requestFilterChain**)로 `ZuulFilterChainRunner`를 생성할때 `Outbound Filter List`(**responseFilterChain**)로  `ZuulEndPointFilter`를 생성하여 인자로 넘겨진다.
그리고 이들은 **nextStage**로 연결되어 있다.

~~~
ZuulFilterChainHandler ----> requestFilterChain (ZuulFilterChainRunner), responseFilterChain (ZuulFilterChainRunner)
                                              (1)	

requestFilterChain (ZuulFilterChainRunner) ----> requestFilters(List), nextStage (ZuulEndPointRunner)
			    (1)													             (2)

nextStage (ZuulEndPointRunner) ----> nextStage (responseFilterChain (ZuulFilterChainRunner))
		(2)												     (3)
~~~

`ZuulFilterChainHandler`에서 **channelRead**시 `requestFilterChain`**(1)** 가 실행된다. 그리고
`Inbound Filter`가 모두 실행되면 `nextStage(ZuulEndPointRunner)`**(2)** 로 요청을 전달한다.

`ZuulEndPointRunner`**(2)** 는 **Context** 정보를 가지고 **ProxyEndpoint**를 만들며, 이때 `Inbound Filter`에서 설정된 **Vip** 정보를 가지고 `NettyOrigin` 객체를 생성한다.

`NettyOrigin`을 통해 `Origin Server`로 요청을 보내며 응답을 받는다. (응답을 받을때는 동적으로 **OriginResponseReceiver Handler**를 `ChannelPipeline` 중간에 추가한다.)

`Origin Server`으로 부터 응답을 받은뒤 `nextStage(responseFilterChain (ZuulFilterChainRunner))`**(3)** 로 `Origin Server`의 응답을 전달한다.
그리고 `reponseFilter(Outbound Filter)`가 실행된다. 그리고 **ChannelOutoundHandler**들을 통해 응답값이 요청자로 반환된다.


###  FilterLoader
Zuul2의 `Inbound`, `Outbound Filter`는 **Groovy**로 작성한다. `FilterLoader`에는 `GroovyCompiler`와 `FilterFactory` 클래스가 있으며, **Runtime**에 `GroovyCompiler`로 **작성한 Filter File**을 **compile** 후 `FilterFactory`로 인스턴스를 생성하여 `FilterRegistry`에 저장한다.

그리고 **작성된 Filter**는 `FilterFileManager`에 의해 동적으로 관리가 된다. **Filter**를 수정하면
프로세스를 재시작 할 필요 없이, 변경사항을 체크 하여 동적으로 다시 로드하여 반영 시킨다.
변경사항을 체크하는 주기는 **5초**로 고정되어 있다.

~~~ java
@Provides
FilterFileManagerConfig provideFilterFileManagerConfig() {
    ...
    FilterFileManagerConfig filterConfig = new FilterFileManagerConfig(filterLocations, filterClassNames, 5);
    ...
}
~~~

> ZuulFiltersModule을 보면 config 설정 값 그리고 어떤 Factory와 Compiler를 사용하는지 볼 수있다.

~~~ java
public boolean putFilter(File file) throws Exception {
    try {
        String sName = file.getAbsolutePath();
        if (this.filterClassLastModified.get(sName) != null && file.lastModified() != (Long)this.filterClassLastModified.get(sName)) {
            LOG.debug("reloading filter " + sName);
            this.filterRegistry.remove(sName);
        }

        ZuulFilter filter = this.filterRegistry.get(sName);
        if (filter == null) {
            Class clazz = this.compiler.compile(file);
            if (!Modifier.isAbstract(clazz.getModifiers())) {
                filter = this.filterFactory.newInstance(clazz);
                this.putFilter(sName, filter, file.lastModified());
                return true;
            }
        }
    }
    ...
}
~~~
`FilterLoader`의 `Filter`를 등록하는 메소드이다. Zuul2는 `Filter`를 동적으로 반영해주는데, 변경 기준을 **file의 수정 시간**으로 판단한다. Filter가 기존에 존재하고 수정시간이 변경됬다면, 기존에 Registry에 등록된 `Filter`를 제거 한 후에 새로 `Filter`를 등록한다. 등록할때는 **key**를 `Filter file`의 **절대경로와 파일이름이 key**가 된다.


### ZuulFilter
Zuul2의 `Filter`는 **Groovy**로 작성한다. `Inbound Filter`는 `HttpInboundSyncFilter`를 상속받아 구현되며, `OutBound Filter`는 `HttpOutboundSyncFilter`를 상속받아 구현한다.

`Filter`가 수행되는 로직은 **apply** 메소드로, `HttpMessage`에서 **Context**를 가져와 **Path로 분기** 처리한다.

작성법의 예는 **Zuul-Sample** 프로젝트를 참고 하면된다.

그 밖의 필요한 옵션들은 메소드를 **override** 하여 설정이 가능하다.

~~~ java
SessionContext context = httpRequestMessage.getContext()
String uuid = context.getUUID()
~~~
요청마다 UUID가 발급되어 context에 저장되는데 이는 나중에 요청에대한 key로 활용 될 수 있다.

#### Filter 우선순위
~~~ java
@Override
int filterOrder() {
    return 21
}
~~~
값이 낮을 수록 우선순위가 높다.

#### Filter 유무
~~~ java
@Override
boolean shouldFilter(HttpRequestMessage httpRequestMessage) {
    return false
}
~~~
true여야 `Filter`를 실행한다. 특정 요청에대해 특정 `Filter`를 건너띄어야 한다면 **shouldFilter**에서 분기 처리를 할수 있다.

#### Http Body 접근
~~~ java
@Override
boolean needsBodyBuffered(HttpRequestMessage request) {
    return true
}
~~~
**HttpMessage Body**에 접근하려면 위 설정을 추가해야 한다.

#### Filter 중지
~~~ java
httpRequestMessage.getContext().stopFilterProcessing()
~~~
다음 `Filter`로 전달하지 않고 중지 시키킨다.


## properties 설정
### Filter path 설정
~~~
# Loading Filters
zuul.filters.root=/service/gateway/src/main/groovy/filter
zuul.filters.locations=${zuul.filters.root}/inbound,${zuul.filters.root}/outbound
zuul.filters.packages=com.netflix.zuul.filters.common
~~~
`Filter file`은 프로젝트와 같이 패키징 되지 않고 별도의 위치에 존재 하기 때문에 **절대경로**로 명시 해준다.

### Origin Service 설정 (Ribbon)
~~~
{ServiceName}.ribbon.xxxx...
~~~
`Origin Service`로의 요청은 **Ribbon**을 통해 **Load Balancing**되어 요청한다.

### Origin Service Server List
~~~
# without Eureka
serviceA.ribbon.ServerListRefreshInterval=2000
serviceA.ribbon.listOfServers=http://localhost:9010
serviceA.ribbon.MaxConnectionsPerHost=-1

config.ribbon.ServerListRefreshInterval=2000
config.ribbon.listOfServers=localhost:7080
config.ribbon.MaxConnectionsPerHost=-1

# with eureka
serviceB.ribbon.NIWSServerListClassName=com.netflix.niws.loadbalancer.DiscoveryEnabledNIWSServerList
serviceB.ribbon.DeploymentContextBasedVipAddresses=eureka_client3
serviceB.MaxConnectionsPerHost=-1
~~~
`Origin Server List`를 설정할 때 **Eureka**를 연동하거나 **properties에 직접설정**할 수 있다. 

Eureka와 연동 하지 않고 properties에 직접 설정했을 경우 이 값은 **Archaius를 통해서 동적으로 변경가능**하다. (ex: config 서버를 구성하면 된다.)

### 성능관련
두가지를 조정해야 한다.

* Connection 제한
* 동시성 처리

#### Connection 제한
~~~
{ServiceName}.ribbon.MaxConnectionsPerHost =-1
~~~

**Endpoint**당 **Connection의 수**이다. (default: 50)

설정이 50이라면 연결될 수 있는 Connection은 최대 50개(Pooled 포함)이며 설정된 수치 이상 Connection은 생성되지 않는다.

실제 Endpoint당 ConnectionPool size는 `{ServiceName}.netty.client.perServerWaterline` 값이다. (default: 4)

Origin과 Connection을 맺을 때 Pooled된 Connection이 없다면 Connection을 생성한다. 이때 PooledConnectionFactory에 의해서 Connection은 PooledConnection으로 wrapping 된다. 그리고 Connection을 사용하고 나서 **release 요청시 Pool에 저장**된다.

Connection을 Pool에 저장하려 할때, 현재 Pool size가 `perServerWaterline` 이상이라면 저장하지 않고 **close** 된다.
이렇게 Pool size가 유지된다.

**MaxConnectionsPerHost** 값을 **-1**로 설정하게 되면 Connection은 제한없이 계속해서 생성된다. 요청량이 많을 경우에만 계속해서 생성되며 **기본적으로 Connection을 acquire 시도시 Pooled된 Connection을 사용한다**.

#### 동시성 처리
~~~
### Origin Concurrency Protection
zuul.origin.{serviceName}.concurrency.max.requests=7500
~~~
**Zuul**에서 **Origin**으로 **요청처리량에 대한 수치**를 조절할 수 있다. 기본적으로는 `concurrency.protect.enabled` 설정이 true 되어 있고, default는 200이다. Origin으로 요청시 Count Check 및 증가 시키며 finish되면 Count를 감소 시킨다.

> Eureka 설정은 [여기]() 참고

## 참고사항
현재 최신 버전은 **2.1.6** 이며

실제 서비스에 사용한 버전은 2.1.3 이다.
2.1.3 ~ 2.1.5에서 특별하게 크게 바뀌진 않았고, 코어 개선 정도로 업데이트 되었다.
그래서 내부 소스 수정 없이 버전만 올려도 문제 없었다.

2.1.6 부터는 일부 수정할 필요가 있다.

`WebSocket`과 `Server Side Push`로 인해서 `BaseServerStartup`에 새로운 **logging 메소드가 추가** 되었고, 
기존에 사용하던 `logPortConfigured` 메소드는 **deprecate** 되었다.

참고로 github sample code는 2.1.6 기준으로 되어 있으며, 문서는 아직 2.1.5로 되어 있다.


dependecy 관련해서 **2.1.3 ~ 2.1.5** 에서는 
`netflix governator-core`와 `common-configuration`, zuul logger인 `blitz4j`를 추가 했어야 했지만,
**2.1.6** 에서는 `google guava`를 추가 해야 한다.
주의 해야 할 점은 **20.0 이하**를 사용해야 한다.

netflix 내부 코어에서 사용하는 `google guice`에서 `com.google.common.base.Objects.toStringHelper`를 사용하고 있는데
이는 **guava 21.0 부터 삭제** 되었기 때문이다.
> [관련 문서](https://issues.apache.org/jira/browse/HADOOP-14891)
