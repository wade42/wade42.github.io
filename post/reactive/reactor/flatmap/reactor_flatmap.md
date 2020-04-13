# Reactor FlatMap의 동작과정 (어떻게 동작 하는 가)
Reactive Operator 중에서 **flatmap**이라는 operator가 있다. **Sub Stream을 flat하게 만들어주는 역할**을 하는데, 그럼 Reactor에서 어떻게 SubStream을 flat하게 동작 시키는지 간단하게 알아본다.

> 참고로 Reactor의 version은 3.3.1 이다.

**flatmap**의 Operator는 `MonoFlatMap`과 `FluxFlatMap`이다.
**Publisher**가 **Mono**일 경우에는 `MonoFlatMap`이 생성되고, **Flux**일 경우에는 `FluxFlatMap`을 사용한다.

~~~ java
final class MonoFlatMap<T, R> extends InternalMonoOperator<T, R> implements Fuseable {
    final Function<? super T, ? extends Mono<? extends R>> mapper;
    …
    public CoreSubscriber<? super T> subscribeOrReturn(CoreSubscriber<? super R> actual) {
        if (FluxFlatMap.trySubscribeScalarMap(this.source, actual, this.mapper, true, false)) {
            return null;
        } else {
            MonoFlatMap.FlatMapMain<T, R> manager = new MonoFlatMap.FlatMapMain(actual, this.mapper);
            actual.onSubscribe(manager);
            return manager;
        }
    }
    …
}
~~~

하지만 내부적으로 `MonoFlatMap`도 `FluxFlatMap`의 메소드를 사용한다.

Reactor 선언시 subscribe가 호출되어 연결작업이 진행될때 호출되는 FlatMap Operator의 `subscribeOrReturn` 메소드를 살펴보면, **flatmap**은 
`FluxFlatMap.trySubscribeScalarMap` 메소드에 의해서 크게 **두 가지로 동작**한다.

**Upstream**이 MonoJust와 같은 **SourceProducer일 경우**와 **MonoOperator(Subscriber)** 일 경우다.


## Upstream이 SourceProducer일 경우

~~~ java
// 아래와 같이 SourceProducer에 이어 바로 호출된 경우 
Mono.just(“test”)
    .flatMap(d -> {
        …
    })
~~~

`FluxFlatMap.trySubscribeScalarMap` 메소드에서는 `Upstream`이 `Producer` 인지 검사한다. 

MonoJust와 같은 `Producer`라면 source의 **value**를 가져온 뒤
`flatmap`으로 전달된 람다(mapper)로 **value**를 전달하여 실행 후 **반환된 Mono(Sub Stream)** 에 **downstream을 구독** 시킨다.

> 마치 defer와 닮았다.

이때 반환된 **Mono(Sub Stream**)에 구독될때 **Sub Stream의 Subscriber 연결 작업이 시작**된다. 그리고 **전달 받은 downstream 에 이어서 연결 작업**이 시작된다. 

***이렇게 stream이 하나로 이어진다.***

## Upstream이 MonoOperator(Subscriber)일 경우

~~~ java
// 아래와 같이 중간에 호출된 경우 
Mono.just(“test”)
    .map(d -> {
        …
     }
    .flatMap(d -> {
        …
    })
~~~

`FluxFlatMap.trySubscribeScalarMap` 메소드에서 **Producer가 아닐 경우** 

~~~
MonoFlatMap.FlatMapMain<T, R> manager = new MonoFlatMap.FlatMapMain(actual, this.mapper);
actual.onSubscribe(manager);
return manager;
~~~

**MonoSubsriber**를 상속 받는 `FlatMapMain`을 생성하여 반환한다.

이때는 **아직 SubStream은 아직 생성되거나 조립되지 않은 단계**이다.

생성은 flatmap으로 전달된 람다(mapper)가 실행될때 생성된다.

그리고 생성된 `FlatMapMain`을 `downstream`의 `onSubscribe`로 전달하여 **downstream들의 Subscription을 설정**한다.

연결작업이 모두 끝나고 `Subscription`을 이용하여 request 후 각 `Subscriber`의 `onNext` 메소드들이 연쇄적으로 호출 되는데,

~~~ java
static final class FlatMapMain<T, R> extends MonoSubscriber<T, R> {
    ...
    public void onNext(T t) {
        Mono m;
        try {
            m = (Mono)Objects.requireNonNull(this.mapper.apply(t), "The mapper returned a null Mono");
        } catch (Throwable var8) {
        ...
        try {
            m.subscribe(this.second);
        } catch (Throwable var7) {
        ...
        }
    }
    ...
}
~~~

`FlatMapMain`의 `onNext` 호출시 
**flatmap**으로 전달된 **람다(mapper)를 실행** 후 반환된 **Mono(Sub Stream)에 downstream을 구독** 시킨다.

**이때 반환된 Mono(Sub Stream)에 구독될때 Sub Stream의 Subscriber 연결 작업이 시작된다. 그리고 전달 받은 downstream 에 이어서 연결 작업이 시작된다.**

~~~ java
abstract class InternalMonoOperator<I, O> extends MonoOperator<I, O> implements Scannable, OptimizableOperator<O, I> {

    public final void subscribe(CoreSubscriber<? super O> subscriber) {
         …
         ((OptimizableOperator)operator).source().subscribe(subscriber);
         …
    }
}
~~~


이때 호출 되는 `subscribe` 메소드는 `InternalMonoOperator`의 `subscribe` 이며 **연결 작업이 끝나면 Sub Stream Publisher를 이용해 다시 실행을 이어 간다.**

***결국, flatmap의 Sub Stream들은 Stream이 실행될 때(Subscriber가 실행될 때) 조립되고 실행된다.***



## 정리
`Operator` 조립시 **flatmap**은 **FlatMapMain이라는 Subsriber**로 조립된다. 

이때는 아직 SubStream들이 생성되거나 downstream과 조립되기 전상태이다. 

**생성**과 **조립**은 `Subscription`에 의해서 Subscriber들이 연쇄적으로 실행될 때, **FlatMapMain의 onNext 호출시에 생성**되고 **Sub Stream이 downstream과 조립**된다.

그리고 조립을 마치고 연결된 Stream의 실행을 이어간다.
