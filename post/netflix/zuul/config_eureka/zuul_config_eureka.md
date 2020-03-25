# Zuul2 Spring Eureka 연동하기
Zuul2를 사용할 때는 필요에따라 Service Discovery와 연동하거나 하지 않는다.

**Service Discovery와 연동하는 경우** 기본적으로 **AWS**로 연결되게 되어있다. 설정을 통해 직접 구축한 **Eureka Server**와 연동되게 Custom 할 수 있다.

Custom 하는 방법은 문서에 나와 있지 않아, 
`Netflix Ribbon`을 참조 해야한다.
이 설정은 Zuul2 뿐만 아니라 **다른 Application에서 사용가능**하다.

**Service Discovery와 연동 하지 않을 경우**에는 Eureka 설정을 꺼줘야 한다. 동적으로 `Origin Server List`를 변경하고 싶다면 **별도로 Config 서버**를 구축하거나 **Archaius**를 이용해야 한다.


## Eureka 설정
Eureka 설정하는 방법은 두가지 방법이 있다.
* **Google Guice와 properties 설정**
* **직접 Instance 생성하여 설정**


### Google Guice와 properties 설정
Zuul2는 내부적으로 Object 의존성을 Google Guice로 관리 하기 때문에 Google Guice 또는 properties 수정으로 변경이 가능하다.

#### 기본설정
Zuul2는 따로 `Guice Module`에서 **binding** 설정을 하지 않으면 기본적으로 `EurekaInstanceConfig`가 `CloudInstanceConfig`(`Amazon`)로 **binding** 된다.


`Amazon`을 사용하지 않고 Eureka 서버를 구축했다면
~~~ java
// custom eureka
bind(EurekaInstanceConfig.class).to(MyDataCenterInstanceConfig.class);
~~~
`Gouce Module`에 **binding** 설정을 추가해야 한다.

그리고 **properties**를 설정해준다.
기본적으로 `namespace`는 **eureka**로 되어 있다.
~~~
eureka.name=gw1
eureka.registration.enabled=true
eureka.client.refresh.interval=5
eureka.validateInstanceId=true
eureka.shouldFetchRegistry=true
eureka.serviceUrl.default=http://localhost:8050/eureka/,http://localhost:8060/eureka/,http://localhost:8070/eureka/
~~~


#### namespace를 변경 하고 싶은 경우

~~~ java
@Inject(
    optional = true
)
@EurekaNamespace
private String namespace;
~~~
`EurekaConfig`들에 위와같이 `namespace`가 **Inject** 되도록 선언되어 있다. `namepsace`에 아무런 **binding** 설정이 되어 있지않다면 내부적으로 `eureka`를 기본적으로 사용된다.

~~~ java
bind(String.class).annotatedWith(EurekaNamespace.class).toInstance("{namesapce}");
~~~
`namespace`를 **binding**을 추가 해준다.

**toInstance** 메소드에 **변경하고자 하는 String name**을 전달한다.

~~~
{namespace}.name=gw1
{namespace}.registration.enabled=true
{namespace}.client.refresh.interval=5
{namespace}.validateInstanceId=true
{namespace}.shouldFetchRegistry=true
{namespace}.serviceUrl.default=http://localhost:8050/eureka/,http://localhost:8060/eureka/,http://localhost:8070/eureka/
~~~
설정한 **namespace**로 properties를 설정해준다.

### 직접 Instance 생성
Instance를 생성하는 방법은 Zuul, Spring 뿐만아니라 다른 **Application에서도 그대로 사용가능**하다.
기본 **설정이 있더라도 다시 새로 생성한 Eureka 설정으로 반영**이 된다. **DiscoveryClient 생성시 DiscoveryManager에 있는 discoveryClient를 덮어 버리기 때문**이다.

~~~ java
// eureka custom
EurekaInstanceConfig instanceConfig = new MyDataCenterInstanceConfig("{namespace}");
InstanceInfo instanceInfo = new EurekaConfigBasedInstanceInfoProvider(instanceConfig).get();
ApplicationInfoManager applicationInfoManager = new ApplicationInfoManager(instanceConfig, instanceInfo);
EurekaClient eurekaClient = new DiscoveryClient(applicationInfoManager, new DefaultEurekaClientConfig("{namespace}"));
~~~
`MyDataCenterInstanceConfig`와 `DefaultEurekaClientConfig`의 **namespace**를 동일하게 설정해준다.

~~~ java
// custom eureka
bind(EurekaInstanceConfig.class).to(MyDataCenterInstanceConfig.class);
~~~
그리고 **binding** 해준다.

~~~
{namespace}.name=gw1
{namespace}.registration.enabled=true
{namespace}.client.refresh.interval=5
{namespace}.validateInstanceId=true
{namespace}.shouldFetchRegistry=true
{namespace}.serviceUrl.default=http://localhost:8050/eureka/,http://localhost:8060/eureka/,http://localhost:8070/eureka/
~~~
설정한 **namespace**로 properties를 설정해준다.

> Instance를 사용했을 경우에는 서버가 종료되면 반드시 EurekaClient를 shutdown 해주는 것을 추천한다.

## Service Discovery(Eureka)를 사용하지 않을 경우
Zuul2는 내부적으로 `Service Discovery`의 `DiscoveryClient`가 생성되며 연결을 시도한다. 때문에 설정으로 더 이상 Service Discovery Server로 접근하지 못하게 설정해야 한다.

설정 방법은 2가지가 있다.

* **Default Amazon 설정을 종료하는 방법**
* **EurekaInstanceConfig binding 이용하는 방법**

### Default Amazon 설정을 종료하는 방법
~~~
eureka.registration.enabled=false
eureka.validateInstanceId=false
eureka.shouldFetchRegistry=false

// 추가 설정
eureka.mt.num_retries=0
~~~
`eureka` 기본 설정 외에 `eureka.mt.xxxx` 설정도 함께 추가 해줘야한다.

**Amazon** 같은 경우에는 **내부적으로 retry 관련 횟수가 고정**되어 있다. 때문에 eureka 기본설정을 false로 하더라도 retry를 하게된다. 기본적으로 `Service Discovery`가 Amazon으로 설정되어 있기 때문에 **Amazon 관련 설정도 추가**해줘야한다.

`PropertyBasedAmazonInfoConfigConstants`에서

~~~ java
static class Values {
    static final int DEFAULT_READ_TIMEOUT = 5000;
    static final int DEFAULT_CONNECT_TIMEOUT = 2000;
    static final int DEFAULT_NUM_RETRIES = 3;
}
~~~

기본적으로 `Connection Timeout` 2초, `Retry` 3회로 되어있어 `Retry` 3회 이후에 서버가 시작 된다.
때문에 위 옵션을 초기화해줘야 바로 서버가 시작된다.

설정하지 않는 다면 다음과같은 로그를 확인 할 수 있다.
~~~ java
com.netflix.appinfo.AmazonInfo$Builder [main] Skipping the rest of AmazonInfo init as we were not able to load instanceId after the configured number of retries: 3, per fail fast configuration: true
com.netflix.appinfo.RefreshableAmazonInfoProvider [main] Datacenter is: Amazon
~~~

그래서 6초 뒤에 Application이 시작된다.

~~~ java
2020-02-17 16:05:41,080 INFO  com.netflix.governator.LifecycleInjectorCreator [main] Injector created successfully 
2020-02-17 16:05:41,093 WARN  com.netflix.discovery.internal.util.Archaius1Utils [main] Cannot find the properties specified : eureka-client. This may be okay if there are other environment specific properties or the configuration is installed with a different mechanism.
2020-02-17 16:05:41,093 WARN  com.netflix.discovery.internal.util.Archaius1Utils [main] Cannot find the properties specified : eureka-client. This may be okay if there are other environment specific properties or the configuration is installed with a different mechanism.
2020-02-17 16:05:47,456 WARN  com.netflix.appinfo.AmazonInfo$Builder [main] Skipping the rest of AmazonInfo init as we were not able to load instanceId after the configured number of retries: 3, per fail fast configuration: true
2020-02-17 16:05:47,457 INFO  com.netflix.appinfo.RefreshableAmazonInfoProvider [main] Datacenter is: Amazon
2020-02-17 16:05:47,458 WARN  com.netflix.discovery.internal.util.Archaius1Utils [main] Cannot find the properties specified : eureka-client. This may be okay if there are other environment specific properties or the configuration is installed with a different mechanism.
2020-02-17 16:05:47,459 WARN  com.netflix.discovery.internal.util.Archaius1Utils [main] Cannot find the properties specified : eureka-client. This may be okay if there are other environment specific properties or the configuration is installed with a different mechanism.
2020-02-17 16:05:47,766 WARN  com.netflix.appinfo.AmazonInfo$Builder [main] Skipping the rest of AmazonInfo init as we were not able to load instanceId after the configured number of retries: 3, per fail fast configuration: true
2020-02-17 16:05:47,766 INFO  com.netflix.appinfo.RefreshableAmazonInfoProvider [main] Datacenter is: Amazon
2020-02-17 16:05:47,770 INFO  com.netflix.appinfo.providers.EurekaConfigBasedInstanceInfoProvider [main] Setting initial instance status as: STARTING
~~~


### EurekaInstanceConfig binding 이용하는 방법
기본 Amazon 설정을 하는 것보다 훨씬 간단하다. 

Service Discovery를 실제 없는 Custom `MyDataCenterInstanceConfig` 로 바꿔주는 방법이다.

~~~
eureka.registration.enabled=false
eureka.validateInstanceId=false
eureka.shouldFetchRegistry=false
~~~
eureka 기본 설정을 해준다.

~~~ java
// custom eureka
bind(EurekaInstanceConfig.class).to(MyDataCenterInstanceConfig.class);
~~~
그리고 `Gouce Module`에 **binding** 설정을 추가준다.

아무런 설정이 없기 때문에 DiscoveryClient의 추가적인 동작 없이 Application이 시작된다.