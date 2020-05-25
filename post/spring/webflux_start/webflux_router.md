# Webflux Mapping Handler 및 동작 과정
약 4개 정도의 서비스들을 Spring MVC 또는 다른 언어에서 Webflux로 전환 하게 되면서 팁(?)이나 문득 궁금했던 점들,  그리고 버전업이 되면서 바뀐점들을 작성 해보았다.

## 왜 전환 하는가
가장 중요한건 서비스 특성상 트래픽이 한순간 몰려서 거나 애초에 트래픽이 많았기 때문에 적은 리소스로 많은 양을 처리 할수 있는 Non-blocking, async로 구조를 바꾸기로 했다.

MVC에서 사용되는 기본 내장 컨테이너(Tomcat)가 아니라 Reactor Pattern과 Event Driven으로 되어있는 netty를 사용하고 싶었다.

사실 기존 컨테이너(Tomcat)를 벗어나 Non-blocking 컨테이너만 사용하려고 했다면, netty 기반인 undertow로 바꾸기만 해도 기존에 비해 처리 수용량이 늘긴하지만, 전체적인 디자인을
Non-blocking, async로 개발 하기 위해서, 그리고 async 개발을 쉽게 하기 위해서 Reactor  기반인 webflux를 사용하였다.

사실 그밖의 여러 이유도 있었다. 서비스를 마이크로 서비스로 구성하면서 GRPC도 지원해야 했고 생각보다 여러 라이브러리 및 프레임워크(grpc, circuite breaker, couchbase 등)들과 호환이 잘되었다. 그리고 단순 성능 벤치마킹만 해봐도 차이가 확연하게 나와서 사용하지 않을 수가 없었다.

## MVC와 동작 과정 차이
내부 구조는 조금 다르겠지만 전체 적인 과정은 MVC와 크게 다르지는 않다.

> Request를 Dispatcher가 받아서 HandlerMapping에서 Request에 적합한 handler를 찾아 HandlerAdapter에 처리를 위임하고 Resolver 또는 Response 처리를 한다.

내부 설정 및 과정은 다음 아래 질문들을 던지면서 살펴 보자.

## Mapping Handler는 어떻게 작성 하는가 (Annotation vs Functional)
진입점에 있어서 가장 큰 차이점은 RequestMapping Handler를 Annotation-base Model로 작성을  하냐, Functional Model로 작성 하냐이다. 작성법의 차이며 두방식 모두 non-blocking으로 실행되고 Reactive Streams API를 사용한다.

그 외에는 대부분 모두 같다. 단지 Functional Model로 작성하게 될 경우, 그 밖의 Besinese 로직들도 Reactor를 이용하여 Functional로 작성하는 것을 추천한다.

### Annotiation base model
가장 익숙한 방법으로, MVC 처럼 Annotaiton 기반으로 작성이 가능하다. 내부적으로 HandlerMapping과 HandlerAdaptor는 non-blocking으로 동작하며 `HttpServletRequest` 와 `HttpServletResponse` 객체 대신에 `ServerHttpRequest` 와 `ServerHttpResponse` 객체로 동작 한다. (컨테이너가 서블릿 컨테이너가 아니기 때문)

> [공식문서](https://docs.spring.io/spring-framework/docs/5.0.0.BUILD-SNAPSHOT/spring-framework-reference/html/web-reactive.html)

참고로 `ServerHttpRequest`와 `ServerHttpResponse`는 컨테이너에 따라 사용되는 클래스가 다르다.

컨테이너를 netty로 사용한다면 `ServerHttpRequest`와 `ServerHttpResponse`는 `ReactorServerHttpRequest`, `ReactorServerHttpResponse` 를 사용한다.

> org.springframework.http.server.reactive에 request와 response, adapter가 모두 구현 되어 있음. 

~~~ java
@Restcontroller
public class TmpController {
    // Get
    @GetMapping("/tmp/test/{name}")
    public Mono<ServerResponse> index(@PathVariable("name") String name) {
        // Mono, Flux로 리턴이 가능하며 일반
        // Mono로 작성하면 함수형으로 작성할 수 있음
        return Ok().build();
    }

    @GetMapping("/tmp/test2/{name}")
    public Mono<Void> index2(ServerHttpRequest request, ServerHttpResponse response) {
        request.getPath();
        System.out.println(request.getPath());
//        return Mono.just(name);

        response.getHeaders().add("log-key", "test1234");
        response.setStatusCode(HttpStatus.BAD_REQUEST);
        return Mono.empty();
    }

    // Post
    @PostMapping("/api/filter")
    public ResponseEntity filter(@RequestBody User user) {

        System.out.println(User.toString());

        return new ResponseEntity<>(targetUser, HttpStatus.OK);
    }

    @PostMapping("/api/filter2")
    public ResponseEntity filter2(@Valid @RequestBody User user, BindingResult result) {
        if(result.hasErrors()) {
            System.out.println(result.getFieldError().getCode());
            return new ResponseEntity<>(result.getFieldError().getCode(), HttpStatus.BAD_REQUEST);
        }
        return new ResponseEntity<>(user, HttpStatus.OK);
    }
}
~~~
객체를 리턴 하여도되고, Mono로 감사서 리턴 해도된다.

### Functional model
Functional model로 작성 하기 위해서는 두가지가 필요하다. **router**와 router에 맵핑 될 **handler** 이다.
Functional Model로 작성시 path와 mapping 되는 Handler 인터페이스는 `HandlerFunction` 이다.
~~~ java
@FunctionalInterface
public interface HandlerFunction<T extends ServerResponse> {
    Mono<T> handle(ServerRequest var1);
}
~~~
> ServerRequest와 ServerResponse는 Annotation-base에서 사용되는 ServerHttpRequest, ServerHttpResponse와 다르다.

handler는 람다로 작성 하거나, `ServerReqeust` 하나만 인자로 받는 메소드를 레퍼런스로 전달한다. 

~~~ java
RouterFunction(path(RequestPredicate), handler(HandlerFunction))
~~~
그리고 path(`RequestPredicate`)와 handler(`HandlerFunction`)는 하나의 `RouterFunction`으로 만들어지고, 이렇게 만들어진 `RouterFunction`들은 하나의 `RouterFunction`으로 다시 취합된다.

 * **RouterFunction 직접 호출**
 ~~~ java
return route(GET("/hello"), (ServerRequest r) -> {
            return ServerResponse.ok().build();
        })
        .andRoute(GET("/user/{number}"), linkTranslateHandler::translateNumberAndLink)
        .andRoute(GET("/user/{number}/name/{name}"), linkTranslateHandler::translateNumberAndLinkByName)
        .andRoute(GET("/target/{target}"), linkTranslateHandler::translateTargetLink)
        .andNest(path("/test"),
            route(GET("/nest1").and(accept(MediaType.APPLICATION_JSON)), r -> {
                    System.out.println("tmp");
                    return ok().build();
                }
            ).andRoute(GET("/nest2").and(accept(MediaType.APPLICATION_JSON)), r -> {
                System.out.println("tmp2");
                return ok().build();
            })
        );
~~~
초기 버전에서 사용했던 방법으로 RouterFunctions의 `route` static method로 `RouterFunction`(`DefaultRouterFunction`)을 생성한다. 그리고 method chain으로 `andRoute` 메소드를 호출하여 설정을 이어간다.

잠깐 내부로 들어가보면,

~~~ java
public interface RouterFunction<T extends ServerResponse> {
    ...
    default RouterFunction<T> andRoute(RequestPredicate predicate, HandlerFunction<T> handlerFunction) {
        return this.and(RouterFunctions.route(predicate, handlerFunction));
    }

    default RouterFunction<T> and(RouterFunction<T> other) {
        return new SameComposedRouterFunction(this, other);
    }
    ...
}
~~~
`andRoute` 메소드는 `RouterFunctions`의 `route`를 이용해서 다시 `RouterFunction`을 생성하고, `and` 메소드를 통해 현재 `RouterFunction`과 새로 생성한 `RouterFunction`을 `SameComposedRouterFunction` 클래스로 wrapping하면서 하나로 취합한다.

~~~ java
static final class SameComposedRouterFunction<T extends ServerResponse> extends RouterFunctions.AbstractRouterFunction<T> {
    private final RouterFunction<T> first;
    private final RouterFunction<T> second;

    public SameComposedRouterFunction(RouterFunction<T> first, RouterFunction<T> second) {
        super(null);
        this.first = first;
        this.second = second;
    }
    …
}
~~~
> RouterFunctions.AbstractRouterFunction는 RouterFunction을 상속

취합될때, 현재 `RouterFunction` 또는 취합된 `SameComposedRouterFunction`은 **first**로 

새로 생성된 `HandlerFunction`은 **second**로 `SameComposedRouterFunction`를 생성한다. 

결국 메소드 체인은 new SCRF(new SCRF`(RF1, RF2)`, `RF3`)이 되고 좀더 

간단하게 표현하면 `((RF1, RF2), RF3)` 이다.

`RF1` 은 **first**, `RF2`는 **second**가 되고, 또 하나의 `(RF1, RF2)`가 되고

`(RF1, RF2)`가 **fist**, `RF3`가 **second**로 계속해서 하나의 `RouterFunction`으로 취합된다.

~~~ java
static final class SameComposedRouterFunction<T extends ServerResponse> extends RouterFunctions.AbstractRouterFunction<T> {
    ...
    public Mono<HandlerFunction<T>> route(ServerRequest request) {
        return this.first.route(request).switchIfEmpty(Mono.defer(() -> {
            return this.second.route(request);
        }));
    }
    ...
}
~~~
그리고 나중에 `HanlderMapping`에서 요청에 대한 handler를 찾을때 `SameComposedRouterFunction`의 route 메소드를 이용하여 handler를 찾는다. `route`가 호출되면 **first**로 request를 전달하여 재귀 호출되며 **first**를 타고 가면서 일치하는 handler를 찾게된다. 그리고 없으면 **second**까지 찾는다.

* **Builder Pattern (추가된 방법)**

~~~ java
return route()
    .path("/c", b ->
        b.nest(accept(MediaType.APPLICATION_JSON), b2 ->
                b2.GET("/user/{number}", linkTranslateHandler::translateNumberAndLink)
                .GET("/user/{number}/name/{name}", linkTranslateHandler::translateNumberAndLinkByName)
                .GET("/test/user/{number}/name/{name}", linkTranslateHandler::translateNumberAndLinkByName)
                .before(request -> {
                    // uuid 발급 (header에 없으면)
                    log.info("before inner");
                    return ServerRequest.from(request)
                            .build();
                })
                .before(userAgentParser)

        )
    )
    .GET("/target/{target}", linkTranslateHandler::translateTargetLink)
    .after((request, response) -> {
        System.out.println(request.headers());
        System.out.println(request.headers().toString());
        // uuid log
        log.info("{}", response.statusCode());
        return response;
    })
    .build();
~~~
 
추가된 방법으로는 **Builder**를 이용한다. 역시 `RouterFunctions`의 `route` static method를 이용하지만 인자가 없는 메소드는 **Builder**를 반환한다.

~~~ java
public static RouterFunctions.Builder route() {
    return new RouterFunctionBuilder();
}
~~~
**Builder** 클래스는 `RouterFunctionBuilder`이다. 

~~~ java
class RouterFunctionBuilder implements Builder {
    private List<RouterFunction<ServerResponse>> routerFunctions = new ArrayList();
    private List<HandlerFilterFunction<ServerResponse, ServerResponse>> filterFunctions = new ArrayList();
    ...
    private Builder add(RequestPredicate predicate, HandlerFunction<ServerResponse> handlerFunction) {
        this.routerFunctions.add(RouterFunctions.route(predicate, handlerFunction));
        return this;
    }
    ...
    public Builder GET(String pattern, RequestPredicate predicate, HandlerFunction<ServerResponse> handlerFunction) {
        return this.add(RequestPredicates.GET(pattern).and(predicate), handlerFunction);
    }
    ...
}
~~~
`GET`, `POST`, `PUT` 등 메소드들을 보면 모두 `add` 메소드를 호출한다. `add` 메소드는 `RouterFunction`의 `andRoute`와 비슷하다. `add` 메소드 역시 `RouterFunctions`의 `route`로 `RouterFunction`을 생성하는데 직접호출하는 방법과 다르게 먼저 **List**에 취합한다.

~~~ java
public RouterFunction<ServerResponse> build() {
        RouterFunction<ServerResponse> result = (RouterFunction)this.routerFunctions.stream().reduce(RouterFunction::and).orElseThrow(IllegalStateException::new);
~~~
그리고 `build` 메소드 호출 시 **List**에 취합한 `RouterFunction`들을 **reduce** 한다. 
~~~ java
public interface RouterFunction<T extends ServerResponse> {
    ...
    default RouterFunction<T> and(RouterFunction<T> other) {
        return new SameComposedRouterFunction(this, other);
    }
    ...
}
~~~
이때 **reduce**로 전달되는 메소드 레퍼런스는 `RouterFunction`의 `and` 이다.

결국, `RouterFunction`을 **직접호출**하는 방법은 호출 할때마다 `RouterFunction`이 취합되고, **Builder**를 이용하는 방법은 **List**에 `RouterFunction`을 먼저 담아두고 `build`시 취합된다.
(그때그때 취합하냐, 마지막에 모아서 취합하냐의 차이이다.)

그리고 **직접호출** 방법에 비해 **Builder** 방법이 메소드명 더 간결하다. 하지만 역할은 동일하다. 

> 참고로 Builder 방식은 스프링 5.1.0 부터 추가 되었다.
> 차이점이 있다면 filter 인데 after와 before를 사용하려면 Builder를 사용해야 한다.
> 이 부분은 다른 글에서 설명!

#### Tip. negate
`negate`는 말그대로 효력이 업게 만드는 것, 매칭효력을 없앤다.

~~~ java
// RouterFunction
.andRoute(POST("/match/any").negate().and(accept(MediaType.APPLICATION_JSON_UTF8)), r -> {
    System.out.println("under path");
    return ok().build();
});
// Builder
.POST("/match/any", accept(MediaType.APPLICATION_JSON).negate(), r -> {
    System.out.println("under path");
    return ServerResponse.ok().build();
})
~~~
`negate`가 추가된 Router는 존재하지 않는 것과 마찬가지가 된다.


## Annotation과 Functional을 동시에 사용 해도 되는가
내부를 살펴보면 handler들은 Prmogramming Model에 따라 리스트로 취합되고, 각 다른 HandlerMapping 클래스에 담아 Bean으로 등록된다.

이는 다음 `WebFluxAutoConfiguration`의 `WebFluxConfigurationSupport` 설정에서 확인해 볼수 있다.

* **Annotaion-base Model -> RequestMappingHandlerMapping**
~~~ java
public class WebFluxConfigurationSupport implements ApplicationContextAware {
    ...
    @Bean
    public RequestMappingHandlerMapping requestMappingHandlerMapping(@Qualifier("webFluxContentTypeResolver") RequestedContentTypeResolver contentTypeResolver) {
        RequestMappingHandlerMapping mapping = this.createRequestMappingHandlerMapping();
        mapping.setOrder(0);
        mapping.setContentTypeResolver(contentTypeResolver);
        ...
~~~
* **Functional Model -> RouterFunctionMapping**
~~~ java
public class WebFluxConfigurationSupport implements ApplicationContextAware {
    ...
    @Bean
    public RouterFunctionMapping routerFunctionMapping(ServerCodecConfigurer serverCodecConfigurer) {
        RouterFunctionMapping mapping = this.createRouterFunctionMapping();
        mapping.setOrder(-1);
        mapping.setMessageReaders(serverCodecConfigurer.getReaders());
        ...
~~~

이 Mapping 클래스들은 Spring에서 기본적으로 제공해주는 `InitializingBean`을 구현 하고 있어, Spring 초기화 시점에 `Controller`나 `RouterFunction` 클래스를 `BeanFactory`에서 가져와 List에 취합 후 초기화 작업을 한다.

그리고 `DispatcherHandler`에서 이 **HandlerMapping** 클래스들을 다시 한번 하나의 List로 취합한다.

**결국, 두 Programming Model 모두 각각의 List와 Bean으로 등록 되기때문에, 동시에 사용해도 된다.**

## 그렇다면 두 Programming Model에 같은 path의 handler가 있을 때, 어떤것이 실행되는가
`DispatcherHandler`에서 `HandlerMapping` 클래스들을 `BeanFactory`에서 모두 가져와 **List로 취합**하고 **정렬**을 한다.

~~~ java
Map<String, HandlerMapping> mappingBeans = BeanFactoryUtils.beansOfTypeIncludingAncestors(context, HandlerMapping.class, true, false);
ArrayList<HandlerMapping> mappings = new ArrayList(mappingBeans.values());
AnnotationAwareOrderComparator.sort(mappings);
~~~

`WebFluxConfigurationSupport` 클래스에서 Programming Model에 따라 사용되는 HadlerMaaping 클래스의 예시 코드 보면, `RouterFunctionMapping`이 **-1**, `RequestMappingHandlerMapping`이 **0**의 order로 setting 된다. (값이 낮을 수록 우선순위가 높다.)

`DispatcherHandler`에서 HandlerMapping들 중에 요청에 맞는 HandlerFunction을 찾는 로직은 다음과 같다.
~~~ java
return this.handlerMappings == null ? this.createNotFoundError() : Flux.fromIterable(this.handlerMappings).concatMap((mapping) -> {
        return mapping.getHandler(exchange);
    }).next().switchIfEmpty(this.createNotFoundError()).flatMap((handler) -> {
        return this.invokeHandler(exchange, handler);
    }).flatMap((result) -> {
        return this.handleResult(exchange, result);
    });
~~~

요청이 왔을시 handlerMappings 에서 순차적으로 찾으며, `next()`로 첫번째 요소만 가져오기 때문에 정렬 순서상 항상 `RouterFunctionMapping` 부터 접근하게 되고 `RouterFunctionMapping`에 있는 `HandlerFunction`만 가져온다.

**즉 Functional Model이 먼저 실행된다.**

## 요청 처리 과정
Spring Web의 core를 살펴 보면 과정을 알 수 있다.
~~~ java
public class HttpHandlerAutoConfiguration {
    ...
    @Bean
    public HttpHandler httpHandler() {
        return WebHttpHandlerBuilder.applicationContext(this.applicationContext).build();
    }
    ...
~~~
Webflux의 Handler Flow 설정인 `HttpHandlerAutoConfiguration`를 보면 `WebHttpHandlerBuilder`를 통해서 `HttpHandler`를 생성하여 Bean으로 등록하게 된다. 

~~~ java
public final class WebHttpHandlerBuilder {
    ...
    public HttpHandler build() {
        WebHandler decorated = new FilteringWebHandler(this.webHandler, this.filters);
        WebHandler decorated = new ExceptionHandlingWebHandler(decorated, this.exceptionHandlers);
        HttpWebHandlerAdapter adapted = new HttpWebHandlerAdapter(decorated);
    ...
    return adapter;
    }
    ...
}
~~~
> DispatcherHandler는 webHandler라는 이름으로 빈에 등록이 되어 있다.
([문서](
https://docs.spring.io/spring/docs/5.0.16.RELEASE/spring-framework-reference/web-reactive.html#webflux-dispatcher-handler))

`HttpHandler`의 생성 과정을 살펴 보면, 먼저 `DispatcherHandler`와 `Filter`로 `FilteringWebHandler`가 생성 된다. `FilteringWebHandler`로 
`ExceptionHandleringWebHandler`를 생성 후
`HttpWebHandlerAdapter`로 주입 되고 이 **Adapter(HttpHandler)** 는 Bean으로 등록된다.

~~~ java
NettyWebServer webServer = new NettyWebServer(httpServer, handlerAdapter, this.lifecycleTimeout);
~~~
Bean으로 등록된 `HttpHandler`는 설정된 Spring 내장 `WebServer`를 생성할때 주입된다.

~~~ java
@Import({ReactiveWebServerFactoryAutoConfiguration.BeanPostProcessorsRegistrar.class, EmbeddedTomcat.class, EmbeddedJetty.class, EmbeddedUndertow.class, EmbeddedNetty.class})
public class ReactiveWebServerFactoryAutoConfiguration {
    public ReactiveWebServerFactoryAutoConfiguration() {
    }
    ...
}
~~~
그리고 총 4가지 내장 `WebServer`를 제공하는 것을 볼 수 있다.


**결국 요청은 HttpHandler에서 시작해서 WebHandler(DispatcherHandler)로 전달이 되어 실행된다.**

####  전체적인 동작은 다음과 같이 두단계로 나눌 수 있다.

* **HttpHandler** : WebServer (Reactor Netty, Undertow, Tomcat, Jetty, and any Servlet 3.1+ container) , filter

**HttpHandler** -> ExceptionHandlingWebHandler -> FilteringWebHandler -> **DefaultWebFilterChain** -> WebFilter -> **WebHandler (DispatcherHandler)**

> [HttpHandler 공식 문서](https://docs.spring.io/spring/docs/current/spring-framework-reference/web-reactive.html#webflux-httphandler)

* **WebHandler**

**WebHandler (DispatcherHandler)** -> HandlerMapping (getHandler) -> HandlerAdapter -> HandlerResult

> maping은 path에 맞는 handler를 찾음

>adapter는 request 객체를 만들어 handler를 실행하는 역할

> resultHandler는 결과 및 응답 처리

> [WebHandler 공식 문서](https://docs.spring.io/spring/docs/current/spring-framework-reference/web-reactive.html#webflux-web-handler-api)

#  정리
* 작성 모델은 두가지

    * Annotation based Model
    * Functional Model

* 두 모델은 동시에 사용 가능

* 우선순위는 Functional Model이 더 높음
    * 때문에 같은 Router가 있는 경우 Functional 이 실행됨

* 함수형 라우터 함수를 정의하는 방법도 두가지
    * RouterFunction 직접 호출
    * Builder Pattern

* 둘의 차이는 호출시 RouterFunction을 취합하냐, 한번에 List에 담아두고 취합하냐의 차이
* after와 before을 사용하려면 Builder를 사용해야함
    
