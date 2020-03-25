# Webflux HandlerFunction

`RouterFunction`을 생성할때 `Path`와 `Method`, `MediaType`에 매칭되는 `HandlerFunction`을 작성하게 된다.

이때 작성하는 `HandlerFunction`를 작성할 때 소소한 작성법을 알아보자.

~~~ java
@FunctionalInterface
public interface HandlerFunction<T extends ServerResponse> {
    Mono<T> handle(ServerRequest var1);
}
~~~
`ServerRequest`를 받고 `Mono<ServerResponse>`를 반환 하는 람다나 메소드를 작성하여 레퍼런스를 전달 하면된다.

보통 간단한 API 구조는 요청값 변환 및 파싱, validation, service 로직 수행후 결과를 반환한다.
그래서 크게 4단계로 알아 본다.

* **요청값 변환**
* **validation**
* **Service method 조합**
* **Response 처리**

## 요청값 변환 (body or path)
### Body Conversion
~~~ java
public ServerRequest translateUserLink(ServerRequest request) {
    // mono
    request.bodyToMono(User.class)
    ...
    // flux
    request.bodyToFlux(User.class)
    ...
}
~~~
`POST`를 처리 할때는 `ServerRequest`에서 요청 데이터 **body**를 `bodyToMono` 또는 `bodyToFlux`로 `Mono<Class>`또는 `Flux<Class>`로 변환하여 **Operator**를 이어갈수 있다.

그리고 기본적으로 **Jackson**을 지원하고 있기 때문에 **jackson annotation**을 사용할 수 있다.


### Path Variable
`Path`를 변수로 치환하여 사용할때 `ServerRequest`의 `pathVariable` 메소드를 이용한다.

~~~ java
// RourterFUnction
GET("/{device}/{os}", linkTranslateHandler::translateUserLink)

// HandlerFunction
public ServerRequest translateUserLink(ServerRequest request) {
    String device = request.pathVariable("device");
    String os = request.pathVariable("os");

    Mono.just(new User(device, os))
        ...
}
~~~


## Validation
**MVC**에서 사용하던 `Validation` 클래스 구조를 그대로 사용했다.

~~~ java
@Component
public class TargetUserVaildator implements Validator{
    @Override
    public boolean supports(Class<?> aClass) {
        return TargetUser.class.equals(aClass);
    }

    @Override
    public void validate(Object o, Errors errors) {
        TargetUser targetUser = (TargetUser) o;
        if(targetUser.getUserid() < 1) {
            errors.rejectValue("userid", "invalid userid");
        }
        ValidationUtils.rejectIfEmptyOrWhitespace(errors, "type", "type is empty");
        ValidationUtils.rejectIfEmptyOrWhitespace(errors, "targetingList", "targetingList is empty");
    }

    // 추가된 메소드
    public void validate(TargetUser targetUser) {
        Errors errors = new BeanPropertyBindingResult(targetUser, "targetUser");
        this.validate(targetUser, errors);

        if(errors.hasErrors()) {
            throw new ServerWebInputException(errors.getFieldError().getCode());
        }
    }
}
~~~
차이점이 있다면, `validate` 메소드를 추가했다. `validate` 호출해서 **errors에 error가 있는지 검사**하고 `Exception`(`ServerWebInputException`)을 throw 한다.
`ServerWebInputException` 는 `ResponseStatusException`를 상속 받은 클래스이며 내부적으로 `status`가 `HttpStatus.BAD_REQUEST`
로 고정되어 있다.

 참고로 **Status**가 고정되어있는 `Exception`은 다음과 같다.
* **ServerWebInputException -> BAD REQUEST**
* **ServerErrorException -> INTERNAL ERROR**

위 두 클래스는 `ResponseStatusException` 상속 받고 있다. 다른 **Status Code**를 주고 싶다면 `ResponseStatusException`를 사용하거나 상속받아 구현한다.

변환 후에 로직을 이어 가면 다음 과 같다.

~~~ java
request.bodyToMono(TargetUser.class) // 변환
	.switchIfEmpty(Mono.just(new TargetUser())) // body가 없는 경우 빈 객체 생성
	.doOnNext(targetUserVaildator::validate) // validate
~~~
**switchIfEmpty 를 추가해줘야하는 이유**는 `POST` 요청시 body가 비어있는 상태라면 `request.bodyToMono` 다음 chaining으로 연결된 `Operator`들은 실행되지 않고 아무런 error 없이 종료된다.

## Service method
그 밖에 Service 클래스에 구현한 method들도 `Mono<T>`로 반환 시켜, **flat**하게 `Operator`를 이어 가는 것을 추천한다.

#### 여러 인자들을 참조해야할 경우가 생길 때
Service method를 `map` 또는 `flatMap Operator`을 이용해서 chaining으로 연결할 때 Service method들이 하나의 parameter만을 받게 설계가 된다면 상관없지만 그렇지가 않은 경우가 있다. 

예를 들어, 메타 데이터와 메소드에서 반환된 값이 계속해서 필요한 경우라고 **가정**하면.

### 아래 예제는 일부러 만든것이니 참고만 하자.

가장 간단한 방법은 `Tuples` 로 감싸서 여러개  데이터를 계속해서 **wrapping**해서 넘기는 방법이 있으나, 이렇게 사용하게 되면 유지보수도 힘들어지고, 코드가 생각보다 많이 난해해 져서 보기가 좋지 않다. (너무 많은 값들을 wrapping 하거나, 빈번히 사용되는 경우에)

#### Tuples Wrapping
다음으로 넘길때 마다 계속해서 참조값을 `Tuples`로 **Wrapping**해서 넘겨야 한다.
이럴 경우에는 인자 들이 점점 많아 지는 경우가 생길 수도 있다.

~~~ java
String id = request.pathVariable("id");
String name = request.pathVariable("name");
DeviceInfo deviceInfo = (DeviceInfo)request.attribute("deviceInfo").get(); // meta data

return Mono.just(deviceInfo)
    .doOnNext(deviceValidator::validate) // pc 인지 mobile 인지 검사
    .map(d -> userValidator.validate(id, name))
    .flatMap(userService::getUserInfo)
    // service1 수행 후 Tuples로 meta data와 함께 반환
    .map(g -> Tuples.of(g, deviceInfo, userService.server1(g, deviceInfo)))
    // service2 수행 후 Tuples로 meta data와 함께 반환
    .map(t -> Tuples.of(t.getT1(), t.getT2(), t.getT3(), userService.server2(t.getT3())))
    // service3 수행
    .map(t -> userService.server3(t.getT1(), t.getT2(), t.getT3(), t.getT4()))

~~~

(억지로) 코드를 고쳐보자.

#### SubStream
`Substream`을 생성하여 함수 외부 인자를 접근하는 방법이다.
`upstream`의 변수를 접근 한다. depth는 늘어나지만 코드가 보기에 훨씬 깔금해 보인다. (주관적)

그리고 Service Method을 작성할 때 `Mono<T>`로 반환하게 작성 했기 때문에 **flatmap**으로 계속 해서 이어 갈수 있다.

~~~ java
String id = request.pathVariable("id");
String name = request.pathVariable("name");
DeviceInfo deviceInfo = (DeviceInfo)request.attribute("deviceInfo").get(); // meta data

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

~~~

## Result 처리
**data**를 내려줘야 하는 경우와 **view template**을 내려줘야하는 경우가 있다.

#### !) 참고사항
**view**를 내려줘야 하는 경우는 한가지 점검해봐야 할것이, `SpringApplication`에서 `@EnableWebflux`를 사용했다면 **제거**해야한다. `@EnableWebflux`를 사용했을 경우 `WebFlux`의 일부 `auto-confuration`을 **disable** 시키는데 여기에 **static resources**가 포함되어 있어 **template engine**을 사용할 수 없게된다.

> [stackoverflow: What is the function of the @EnableWebFlux annotation](https://stackoverflow.com/questions/51843344/what-is-the-function-of-the-enablewebflux-annotation?noredirect=1&lq=1)

> 참고로 webflux는 thymeleaf를 default template engine으로 사용한다.


### 성공 처리
#### data를 내려줘야 할때
예전에는 BodyInserters의 fromObject를 사용했지만 현재는 Deprecated 되었다. 아래와 같이 처리한다.
~~~ java
ServerResponse.status(HttpStatus.OK).contentType(MediaType.APPLICATION_JSON).body(fromValue(DATA))
~~~

~~~ java
ServerResponse.status(HttpStatus.OK).contentType(MediaType.APPLICATION_JSON).bodyValue(DATA)
~~~

#### html page를 내려줘야할 때
* **page**
~~~ java
ServerResponse.status(HttpStatus.OK).contentType(MediaType.TEXT_HTML).render("permission");
~~~

* **page with data**
~~~~ java
ServerResponse.status(HttpStatus.OK).contentType(MediaType.TEXT_HTML).render("permission", info);
~~~~

### 에러 처리
#### data를 내려줘야 할때
~~~ java
.onErrorResume(ServerWebInputException.class, e -> ServerResponse.status(HttpStatus.BAD_REQUEST).bodyValue(e.getReason()))
.onErrorResume(Exception.class, e -> ServerResponse.status(HttpStatus.INTERNAL_SERVER_ERROR).bodyValue(e.getMessage()))
~~~

#### error page를 내려줘야할 떄
~~~ java
// onErrorResume
.onErrorResume(ServerWebInputException.class, e -> ServerResponse.status(HttpStatus.BAD_REQUEST).contentType(MediaType.TEXT_HTML).render("40X"))
.onErrorResume(Exception.class, e -> ServerResponse.status(HttpStatus.INTERNAL_SERVER_ERROR).contentType(MediaType.TEXT_HTML).render("50X"))

// onErrorReturn
.onErrorReturn(ServerWebInputException.class, ServerResponse.status(HttpStatus.BAD_REQUEST).contentType(MediaType.TEXT_HTML).render("40X"))
.onErrorReturn(Exception.class, ServerResponse.status(HttpStatus.INTERNAL_SERVER_ERROR).contentType(MediaType.TEXT_HTML).render("50X"))
~~~

`onErrorResume`를 사용한 이유는 발생된 `Exception` 객체를 전달 받기 위함이고, `Exception` 객체가 필요 없다면 `onErrorReturn`를 사용해도 된다.

최종적으로 아래와 같이 작성 할수 있다.
~~~ java
return request.bodyToMono(User.class)
    .switchIfEmpty(Mono.just(new User()))
    // validation
    .doOnNext(userVaildator::validate) 
    // service
    .flatMap(userService::getUserInfo)
    .flatMap(userService::getStatistics)
    // success response
    .flatMap(r -> ServerResponse.status(HttpStatus.OK).contentType(MediaType.APPLICATION_JSON).bodyValue(DATA))
    // error response
    .onErrorResume(ServerWebInputException.class, e -> ServerResponse.status(HttpStatus.BAD_REQUEST).bodyValue(e.getReason()))
    .onErrorResume(Exception.class, e -> ServerResponse.status(HttpStatus.INTERNAL_SERVER_ERROR).bodyValue(e.getMessage()))

~~~

# 정리
* view를 내려줘야 할 경우 @EnableWebflux를 사용하지 않아야함
    * [stackoverflow: What is the function of the @EnableWebFlux annotation](https://stackoverflow.com/questions/51843344/what-is-the-function-of-the-enablewebflux-annotation?noredirect=1&lq=1)