# Webflux Filter (Webfilter, HandlerFilterFunction)
handler가 실행되기 전에 사전작업이 필요한경우 사용한다.
보통 인증, 로그, 데이터 파싱에 사용했다.

filter를 적용하는 방법에는 두가지가 있다.

* Webfilter 인터페이스를 구현후 Bean 등록
* HandlerFilterFunction 인터페이스를 구현하여 router에 적용

사용하는 방법은 간단하게 설명하고 내부를 차근차근 설명하겠다.

## 종류와 차이
Filter를 구현하는 방법은 간단하다.

### WebFilter
`WebFilter`는 **filter** 메소드 하나를 갖고 있는 interface 이다. 이를 구현하여 Bean으로 등록 하면 `HttpHandler` Build시 취합되어 설정된다.

~~~ java
@Component
public class AWebFilter implements WebFilter {
    @Override
    public Mono<Void> filter(ServerWebExchange serverWebExchange, WebFilterChain webFilterChain) {
        // todo
        System.out.println("======> AWebFilter");
        System.out.println( serverWebExchange.getRequest().getPath());
        return webFilterChain.filter(serverWebExchange);
    }
}
~~~
구현한 filter를 수행 후 ServerWebExchange를 `WebFilterChain`을 통해 다음 **filter** 또는 **handler**로 전달한다.

### HandlerFilterFunction
`FilterFunction` 역시 `HandlerFilterFunction` interface를 구현하여 하여 적용시킨다.

~~~ java
public class AuthFilterFunction implements HandlerFilterFunction<ServerResponse, ServerResponse> {
    @Override
    public Mono<ServerResponse> filter(ServerRequest serverRequest, HandlerFunction<ServerResponse> handlerFunction) {
         // todo
         return handlerFunction.handle(serverRequest);
    }
}
~~~
구현한 filter를 수행 후 전달 받은 **handler**로 `ServerRequest`를 전달한다.

~~~ java
return route(GET("/user/register"), userViewHandler::userRegister)
    .andRoute(GET("/monitoring"), userViewHandler::monitoring)
    .andRoute(GET("/accounts"), userViewHandler::accounts)
    .filter(new AuthFilterFunction(environment)); // auth filter
~~~
그리고 `RouterFunction`의 `router`에 적용시키면 된다. 그리고 `HandlerFilterFunction`는 `FuntionalInterface`이기 때문에 **람다**로 작성하여도 된다.

> Path에 Mapping된 `HandlerFunction`들은 `RouterFunction` 또는 `SameComposedRouterFunction`으로 취합되고, 취합된 `RouterFunction`과 `HandlerFilterFunction`는 `FilteredRouterFunction`으로 취합된다.

두 filter의 **차이점**으로는 `Webfilter` 같은 경우는 모든 handler 요청에 적용이되고, `HandlerFilterFunction`은 특정 요청에 매칭되는 handler에 적용할 수 있다.

> 예를 들어 인증이 필요한 API와 필요 없는 API를 구분하여 적용할 수 있고, 인증 같은 경우 403, 404, 500 status code와 json을 내려줄 수도 있지만, 상황에 따라 해당 에러 페이지를 내려 줄 수 있다.

`Webfilter`에서 특정 경로는 **filter**를 무시 하고 싶다면, `serverWebExchange.getRequest().getPath()`를 이용하여 **path**로 분기 처리 해야 한다.

> 두 filter의 차이점과 실행시점과 순서는 아래에서 설명 하겠다.


### 추가된 HandlerFilterFunction
Spring이 버전업이 되면서 새로운 filter 메소드가 생겼다. `after`와 `before`이다.

~~~ java
return route().
    .GET("/user/{name}/link", linkTranslateHandler::translateUserLinkByName)
    .GET("/test/user/{name}/link", linkTranslateHandler::translateUserLinkByName)
    .before(request -> {
        // uuid 발급 (header에 없으면)
        log.info("before inner1");

        return ServerRequest.from(request)
                .build();
    })
    .before(userAgentParser)
    .filter((r, h) -> {
        log.info("filter inner1");
        return h.handle(r);
    })
    .after((request, response) -> {
        log.info("after inner2");
        return response;
    });
~~~
`after`와 `before`를 사용하기 위해서는 `router`를 **Functionnal Model**의 **Builder Pattern**으로 작성하여 한다.

> 참고로 Function Model의 Builder Pattern으로 Router를 생성할 때 `RouterFunction`을 **List**에 담아두었다가 build시 하나의 `RouterFunction`으로 **reduce** 되는데, `HandlerFilterFunction` 역시 동일하다.
별도 **List**에 `FilterFunction`들을 담아 두었다가 **reduce** 된다. 그리고 하나의 `FilteredRouterFunction`으로 만들어진다.

`after`와 `before`내부를 살펴보면 `filter`와 동일하다.
**Functional Model**의 **Builder**인 `RouterFunctionBuilder`를 보면 알수 있다.

* **Builder filter method**
~~~ java
public Builder filter(HandlerFilterFunction<ServerResponse, ServerResponse> filterFunction) {
    Assert.notNull(filterFunction, "HandlerFilterFunction must not be null");
    this.filterFunctions.add(filterFunction);
    return this;
}
~~~
**Builder**에서 `filter`를 등록하는 메소드이다. 전달되는 `HandlerFilterFunction`을 **List**에 추가한다.

* **Builder before method**
~~~ java
public Builder before(Function<ServerRequest, ServerRequest> requestProcessor) {
    Assert.notNull(requestProcessor, "RequestProcessor must not be null");
    return this.filter((request, next) -> {
        return next.handle((ServerRequest)requestProcessor.apply(request));
    });
}
~~~
`before` 메소드의 interface는 `HandlerFilterFunction`과 다르게 `ServerRequest`를 받아 `ServerRequest`를 반환하는 형태다. 

`RouterFunction`에 `before`를 추가할때 내부를 살펴보면 `before`가 호출되고 반환된 `ServerRequest`를 **다음 handler**로 `ServerRequest`를 전달하는 `HandlerFilterFunction` 람다를 **Builder**의 `filter`를 통해 **List**로 추가 된다.

먼저 로직이 실행된 후 **다음 handler**로 `ServerReqeust`가 전달되는 건 `filter`와 동일이다.

단지 `before`는 `ServerReqeust`만 접근이 가능하고 `ServerReponse`를 접근할 수 없기 때문에, `header check`, `logging`, `attribute` 접근용도로 사용하는 것이 적합하다. 무언가를 판단하여 응답을 바로 내려줘야 하는 경우에는 `filter`를 사용해야 한다.


* **Builder after method**
~~~ java
public Builder after(BiFunction<ServerRequest, ServerResponse, ServerResponse> responseProcessor) {
    Assert.notNull(responseProcessor, "ResponseProcessor must not be null");
    return this.filter((request, next) -> {
        return next.handle(request).map((serverResponse) -> {
            return (ServerResponse)responseProcessor.apply(request, serverResponse);
        });
    });
}
~~~
`after`는 `before`나 `filter`와 조금 다르다.
`filter`나 `before`에서는 현재 로직을 수행하고 전달받은 **다음 handler**를 호출 하는 반면, `after`에서는 **다음 handle** 호출 응답값(`Mono<ServerResponse>`)에 `map`으로 연결하여 `after` 가 호출 되게 되어 있다.

 결국 **다음 handler** 호출 뒤에 `after`가 호출된다.

## HandlerFilterFunction들의 실행 순서
좀더 자세히 알아보자. 아래는 `RouterFunctionBuilder`에서 마지막 build 단계이다.
`after`와 `before`가 추가되면서 조금 달라졌다.

~~~ java
class RouterFunctionBuilder implements Builder {
    ...
    public RouterFunction<ServerResponse> build() {
        RouterFunction<ServerResponse> result = (RouterFunction)this.routerFunctions.stream().reduce(RouterFunction::and).orElseThrow(IllegalStateException::new);
        if (this.filterFunctions.isEmpty()) {
            return result;
        } else {
            HandlerFilterFunction<ServerResponse, ServerResponse> filter = (HandlerFilterFunction)this.filterFunctions.stream().reduce(HandlerFilterFunction::andThen).orElseThrow(IllegalStateException::new);
            return result.filter(filter);
        }
    }
}
~~~

**filterFunction List**에 `HandlerFilterFunction`이 존재 한다면 `HandlerFilterFunction`을 하나의 함수로 취합한다.

위에 `reduce`에 메소드 참조로 호출되는 `HandlerFilterFunction`의 `andThen`은 **BinaryOperator accumulate**로 동작한다. (같은 타입의 인자 두개를 받아 같은 타입의 결과를 반환한다.)

~~~ java
default HandlerFilterFunction<T, R> andThen(HandlerFilterFunction<T, T> after) {
    Assert.notNull(after, "HandlerFilterFunction must not be null");
    return (request, next) -> {
        HandlerFunction<T> nextHandler = (handlerRequest) -> {
            return after.filter(handlerRequest, next);
        };
        return this.filter(request, nextHandler);
    };
}
~~~
`List`에 저장된 순으로 `reduce`를 수행하게된다. 

참고로 **accumulate**이기 때문에 `this`가 **accumulate**된 묶음이 되고 `after`가 **다음 FilterFunction**이다. 그리고 `filter`로 전달되는 `HanderFunction`이 람다로 전달되는데, **다음 FilterFunction**을 호출 하는 로직이 담겨 있는 `HandlerFunction`이다. 이렇게 `filter`는 연결되며 `filter`를 **수행 후 handler를 호출(HandlerFilterFunction 구현 참고)** 함으로써 `filter`들이 순차적으로 호출된다.

### 잠깐! 어떻게 filter가 실행되지, 과정을 살펴보자.

`RouterFunctionMapping`에서 `getHandler`를 통해 요청에 대한 `RouterFunction`을 찾고, 찾은 `RouterFunction`의 `route` 메소드에 ServerReqeust를 전달 함으로써 통해서 HandlerFunction을 수행하게 된다.

`filter`가 있는 경우는 `RouterFunction`은 취합과정에 의해 `FilteredRouterFunction`이 되며, 이때 `route`가 실행될때 **reduce** 된 `HandlerFilterFunction`에 `HandlerFunction`이 전달된면서 실행이된다.

~~~ java
static final class FilteredRouterFunction<T extends ServerResponse, S extends ServerResponse> implements RouterFunction<S> {
    private final RouterFunction<T> routerFunction;
    private final HandlerFilterFunction<T, S> filterFunction;
    ...
    public Mono<HandlerFunction<S>> route(ServerRequest request) {
        Mono var10000 = this.routerFunction.route(request);
        HandlerFilterFunction var10001 = this.filterFunction;
        this.filterFunction.getClass();
        return var10000.map(var10001::apply);
    }
    ...
~~~
`routerFunction`에서 요정에 대한 `HandlerFunciton`을 찾게 되면 `Mono<HandlerFunction>`을 반환하며 **map**을 통해 `filterFunction`으로 `HandlerFunction`이 전달된다.
결국 **reduce** 되는 **andThen**에서 최초로 넘겨지는 **next**는 `RouterFunction`의 `HandlerFunction`이다.

다시 본론으로 돌아가서.

* **filter 간 실행순서**
~~~ java
    .before(before1)
    .filter(filter1)
    .before(before2)
    .after(after1)
    .after(after2)
~~~
예를들어 다음과 같이 `filter`를 적용했다면, 

두 `HandlerFilterFunction`을 호출하는 람다를 묶어서 (`this`, `after`)로 간단하게 표현한다면 `reduce`된 `HandlerFilterFunction`은 다음과 같다. 

(before1, filter1)

((before1, filter1), before2)

(((before1, filter1), before2), after1) ...

~~~ java
((((before1, filter1), before2), after1), after2)
~~~
실행순서를 예상해보면 설정 순서대로

before1 -> filter1 -> before2 -> after1 -> after2 일것 같지만, 

실제로는 

**before1 -> filter1 -> before2 -> after2 -> after1** 순으로 실행된다.



이제 reduce에서 정의된 람다를 한커풀씩 벗겨보면 **(this, after2)** 가 처음에 실행될때, **this**는 **(((before1, filter1), before2), after1)** 이다.

~~~ java
this.filter(request, handlerRequest -> {
    after2.filter(handlerRequest, routerFunction);
});
~~~

이를 좀더 간단하게 축약하면
~~~ java
before1.filter(request, 
    filter1.filter(request,
        before2.filter(request,
            after1.filter(request,
                after2.filter(request,
                    routerHandler.handle
                )
            )
        )    
    )
)
~~~
여기서 중요한건 `after`이다. **map Operator** 때문에 
다음 handler가 실행된 뒤에 이어서 실행된다.
즉 `after`는 선언의 거꾸로 실행 순서를 갖는다.
`RouterHandler` 실행 후 반환되는 값에 **after2** 가 **map**으로,
이에 이어서 **after1**이 **map**으로 이어가게 된다.

보충 설명하자면, filter로 넘겨지는 인자는 `ServerRequest`와 `HandlerFunction`이다.
넘겨진 handler 뒤에 **map**으로 **after**가 이어지게 되는 것이다.

~~~ java
before1.filter(request, 
    filter1.filter(request,
        before2.filter(request,
            routerHandler(request).map(after2).map(after1)
        )    
    )
)
~~~
최종적으로 위와 같이 실행된다.

## WebFilter들의 실행 순서
~~~ java
public static WebHttpHandlerBuilder applicationContext(ApplicationContext context) {
    WebHttpHandlerBuilder builder = new WebHttpHandlerBuilder((WebHandler)context.getBean("webHandler", WebHandler.class), context);
    List<WebFilter> webFilters = (List)context.getBeanProvider(WebFilter.class).orderedStream().collect(Collectors.toList());
    builder.filters((filters) -> {
        filters.addAll(webFilters);
    });
    ...
}
~~~
구현된 `WebFilter`는 Bean으로 등록 되는데, `HttpHandler`가 Build되기 전에 BeanFactory에서 등록된 `WebFilter`들을 가져오게 된다. 이때 **정렬**된다.

~~~ java
@Component
@Order(1)
public class AWebFilter implements WebFilter {
    @Override
    public Mono<Void> filter(ServerWebExchange serverWebExchange, WebFilterChain webFilterChain) {
        System.out.println("======> AWebFilter");
        return webFilterChain.filter(serverWebExchange);
    }
}
~~~
구현한 `WebFilter`에 `@Order`를 통해서 우선순위를 정할 수 있다.

## WebFilter와 HandlerFilterFunction의 실행 시점
`WebFilter`와 `HandlerFilterFunction`은 실행 시점이 다르다.

* **WebFilter**

`WebFilter`는 `HttpHandler`가 Build 되기 전에 취합이 되며, 요청들이 `WebHandlerDecorator`들로 위임 ***(HttpHandler -> ExceptionHandlingWebHandler -> FilteringWebhandler -> DefaultWebFilterChain)*** 이 되면서 실제적으로 `DefaultWebFilterChain`에서 `WebFilter`와 `WebHandler`(`DispatcherHandler`)가 실행된다.

> 참고로 DefaultWebFilterChain 또한 WebFilter를 하나씩 갖는 DefaultWebFilterChain으로 wrapping 되어 하나로 취합된다. (initChain 메소드 참고)

~~~ java
public class DefaultWebFilterChain implements WebFilterChain {
    ...
    public Mono<Void> filter(ServerWebExchange exchange) {
        return Mono.defer(() -> {
            return this.currentFilter != null && this.chain != null ? this.invokeFilter(this.currentFilter, this.chain, exchange) : this.handler.handle(exchange);
        });
    }
    ...
}
~~~
`DefaultWebFilterChain`의 `filter` 메소드를 살펴보면 `WebFilter`를 순회하고 최종적으로 마지막에 `WebHandler`로 `ServerWebExchange`가 전달된다. 

**즉, 모든 WebFilter가 실행되고 나서 WebHandler가 실행된다.**

`DefaultWebFilterChain`의 `filter`는 최초에 요청이 위임될때 `FilteringWebHandler`에서 `handle` 메소드에 의해 호출된다. 

~~~ java
private Mono<Void> invokeFilter(WebFilter current, DefaultWebFilterChain chain, ServerWebExchange exchange) {
    return current.filter(exchange, chain).checkpoint(current.getClass().getName() + " [DefaultWebFilterChain]");
}
~~~
`WebFilter`를 구현할 때 `ServerWebExchange`와 `WebFilterChain` 두 인자를 받는 `filter` 메소드를 구하게 된다. 이때 넘겨 받는 `WebFilterChain`은 다음 실행될 `DefaultWebFilterChain` 이다. `invokeFilter` 메소드를 보면 현재 `filter`를 실행할때 `ServerWebExchange`와 `WebFilterChain`(`다음 실행될 chain`)을 넘겨주는 것을 확인할 수 있다. 그래서 filter를 수행하고 전달받은 chain을 다시 호출 함으로 써 chain들이 연쇄적으로 호출 하게 된다.

* **HandlerFilterFunction**

`HandlerFilterFunction`은 `RouterFunction`을 생성할 때 `HandlerFunction`과 함께 취합되어 Bean으로 등록되고, `DispatcherHandler`(`WebHandler`)에서 `HandlerMapping`으로 다시한번 취합되게 된다. 
> 자세한건 [webflux Mapping Handler 및 동작 과정]() 문서 참고

위에서도 `FilteredRouterFunction`을 설명 한것처럼 `route` 메소드를 호출할 때 `HandlerFilterFunction`들이 실행된 후에 `HandlerFunction`이 실행된다.

**즉, WebHandler(DispatcherHandler)의 HandlerMapping에서 요청에 대한 HandlerFunction을 찾고, HandlerAdapter로 위임하여 HandlerFunction이 호출 될때 실행된다.**

***결국 WebFilter는 WebHandler가 실행되기 전에 실행되고 HandlerFilterFunction는 WebHandler에서 실행되기 때문에 항상 WebFilter가 먼저 시행된다.***


# 정리
* handler가 실행되기 전에 filter를 설정할 수 있다.
* filter는 두가지가 있다.
    * WebFilter
    * HandlerFilterFunction
* WebFilter는 WebFilter interface를 구현 후 Bean으로 등록
* HandlerFilterFunction은 RouterFunction 정의시 함께 정의
    * before와 after를 사용시 RouterFunction을 Functional로 작성
* WebFilter는 WebHandler 이전에 실행됨.
* HandlerFilterFunction은 WebHandler에서 handler 실행 이전, 이후에 실행됨