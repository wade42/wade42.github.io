# Reactor 내부 동작 과정 (Just and Defer, Mono and Flux)

Reactor Operator들이 실행될때 내부에 어떤 일이 일어나는지 Mono와 Flux는 내부적으로 동작이 다른지 정도로 간단하게만 알아본다.
> 각 구성들의 역할에 대한 자세한 설명은 제외하고 흐름만 작성하였다.


Reactor의 **Operator**는 임의의 **Publisher**이며 **Decorating**을 역할을 한다. 그리고 각 **Operator들과 연관된 각 Subscriber**들이 React core에 정의가 되어 있다. 
> 하나의 예로 map 의 Operator 클래스는 MonoMap 이며 Subsriber 클래스는 MapSubscriber이다.


Reactor를 사용할때 보통 메소드 chaining으로 Operator 메소드에 람다를 전달하며 작성 하게된다. 이때 마다 **Operator 객체**들이 생성되고 반환된다.

예를 들면

~~~ java
Mono.just().map().subscribe()
~~~

***다음과 같이 표현 가능하다.***

~~~ java
MonoJust().MonoMap().(Mono)subscribe()
~~~


내부로 들어가보자.
> RxJava2의 **Pub/Sub Pattern** 구조(**Publsiher**, **Subscription**, **Subscriber**)를 알고있다면 이해하기 쉽다.

## Mono를 사용한 경우
> Mono는 0 또는 1의 data를 다룬다.

~~~ java
public final void subscribe(Subscriber<? super T> actual) {
    ...
    while(true) {
        subscriber = operator.subscribeOrReturn(subscriber);
        if (subscriber == null) {
            return;
        }

        OptimizableOperator newSource = operator.nextOptimizableSource();
        if (newSource == null) {
            publisher = operator.source();
            break;
        }

        operator = newSource;
    }

    publisher.subscribe(subscriber);
}
~~~
> 메소드 chaining 마지막에 subscrib가 호출되면 subscribe으로 전달된 success, error, complete 람다들은 LambdaMonoSubscriber로 wrapping 된다. 그리고 위의 subscribe 가호출된다. (Operator 메소드 chaining에서 마지막에 호출하는 subscribe와 다른 메소드다.)

메소드 chaining 마지막에 subscrib가 호출되고 나서 **upstream(Subscriber)** 과 **downstream(Subscriber)** 의 **조립(연결)작업**이 시작된다. **(upstram Subscriber에 downStream의 Subscriber를 참조시키는 방법으로 가장 마지막 Subscriber 부터 시작해서 최상위까지 반복된다.)**

최상위의 `Publisher`(`MonoJust`, `MonoDefer` 등)까지 도달하면 더이상 `Subscriber`가 존재하지 않기 때문에 `while`문이 끝나게 된다. `Publisher`(`MonoJust`, `MonoDefer` 등)를 제외한 각 `Subscriber`들은 **downstream**의 `Subscriber`를 **참조**하고 있는 형태로 **줄줄이 참조**된다. (***하나의 Stream이 된다.***)

결국 **subscriber 변수에는 연결된 Subscriber들중 최상위 Subscriber**가 되고 **publisher 변수에는 Publisher(MonoJust, MonoDefer)** 로 분리된다.


~~~ java
publisher.subscribe(subscriber);
~~~
그리고 연결된 Subscriber(Stream)를 Publisher에 구독시킨다.

~~~ java
final class MonoJust<T> extends Mono<T> implements ScalarCallable<T>, Fuseable, SourceProducer<T> {
    public void subscribe(CoreSubscriber<? super T> actual) {
        actual.onSubscribe(Operators.scalarSubscription(actual, this.value));
    }
}
~~~
구독될때 `Subscriber`로 `Subscription`을 생성해서 `onSubscribe`를 호출한다. 이때 `Subscription`에는 **최상위 Subscriber**와 **value**를 가지고 있다.

~~~ java
public void onSubscribe(Subscription s) {
    if (Operators.validate(this.s, s)) {
        this.s = s;
        this.actual.onSubscribe(this);
    }
}

// upstream to downstream ...
subscribOn -> subscribOn -> subscribOn ...
~~~
`Subscriber`의 `onSubscribe`이 호출되면 `Subscriber`는 **Stream**이기 때문에 **연쇄적으로 downstream의 onSubscribe이 호출**된다.
> 참고로 Subscriber는 Subscription을 상속 받고 있다.

~~~ java
final class LambdaMonoSubscriber<T> implements InnerConsumer<T>, Disposable {
    ...
    public final void onSubscribe(Subscription s) {
        if (Operators.validate(this.subscription, s)) {
            this.subscription = s;
            if (this.subscriptionConsumer != null) {
                ...
            } else {
                s.request(9223372036854775807L);
            }
        }
    }
    ...
}
~~~
가장 마지막 `Subsriber`인 `LambdaMonoSubscriber`에서 `Subscription`을 통해 **data를 요청**한다.
> 요청시 기본적으로 9223372036854775807L(LONG.MAX)개를 요청한다. (Mono는 0 to 1개의 data를 다른다.)

> Subscription의 request를 조절하고 싶다면 LambdaMonoSubscriber에서 (success, error, complete)에서 4번째 인자로 subscription을 받는 람다를 추가하면 된다. 

~~~ java
static final class ScalarSubscription<T> implements SynchronousSubscription<T>, InnerProducer<T> {
    ...
    public void request(long n) {
        if (Operators.validate(n) && ONCE.compareAndSet(this, 0, 1)) {
            Subscriber<? super T> a = this.actual;
            a.onNext(this.value);
            if (this.once != 2) {
                a.onComplete();
            }
        }

    }
    ...
}
~~~
`Subscription`에는 **최상위 Subscriber**과 **value**를 가지고 있다. `request`가 호출되면 `Subscriber`로 **value**를 `onNext` 메소드를 통해 **전달**한다. 

~~~ java
// ex)
static final class MapSubscriber<T, R> implements InnerOperator<T, R> {
    ...
    public void onNext(T t) {
        ...
        v = Objects.requireNonNull(this.mapper.apply(t), "The mapper returned a null value.");
        ...
        this.actual.onNext(v);
    }
    ...
}
// upstream to downstream
onNext -> onNext -> onNext ...
~~~
각 `Subscriber`의 `onNext`는 `Operator`로 **전달되었던 람다를 실행하고 그 결과를 downstream으로 전달**한다.
그리고 역시 `Subscriber`의 `onNext` 호출시 **연쇄적으로 upstream에서 downstream으로 onNext가 호출**된다.

***때문에 모든 Operator로 전달되었던 람다 또는 메소드가 결과를 전달받으며 순차적으로 실행된다.***


### 추가로 defer를 살펴보자
~~~ java
Mono.defer(() -> {
    return Mono.just(1);
})
.map(...
~~~


`defer`는 `just`와 더불어 하나의 **Publisher이자 Producer**이다. 
~~~ java
public static <T> Mono<T> defer(Supplier<? extends Mono<? extends T>> supplier) {
    return onAssembly(new MonoDefer(supplier));
}
~~~
`defer`는 `Mono<T>`를 리턴하는 `FunctionalInterface`를 받는다.
그리고 `MonoDefer` Operator가 만들어진다.

~~~ java
public void subscribe(CoreSubscriber<? super T> actual) {
    Mono p;
    try {
        p = (Mono)Objects.requireNonNull(this.supplier.get(), "The Mono returned by the supplier is null");
    } catch (Throwable var4) {
        Operators.error(actual, Operators.onOperatorError(var4, actual.currentContext()));
        return;
    }

    p.subscribe(actual);
}
~~~
`defer`도 **Publisher**이기 때문에 `MonoDefer`는 **subscribe** 메소드가 있다. `defer`로 **전달된 람다를 실행**하고 반환되는 `Mono<T>` 에 **subscribe**를 호출한다. 

이때 호출되는 **subscribe**는 아래와 같다.
~~~ java
publisher.subscribe(subscriber);
~~~


**즉, defer의 value는 Subscriber가 구독되기 전에 감싸진 람다가 실행되면서 정해진다.**

***결론은 Subscriber로 전달되는 data는
just의 경우 Operator를 선언할 때 결정이되고 defer는 구독이 될때 결정 된다.
그래서 선언만 해놓고 나중에 구독된다면, 결과 값이 다를 수 있다.***

> [defer 동작에 대한 예제 설명](https://stackoverflow.com/a/55972232)


## Flux를 사용한 경우
> Flux는 다르게 0 to N의 data를 다룬다.

`Mono`와 내부적인 동작은 모두 동일하다. 차이점은 `Mono`와 다르게 **다수의 data**를 다루기 때문에 내부적으로 data들은
 **FluxArray**로 변환되어 사용되고, 또 **Subscription**의 동작이 조금 다르다.

~~~ java
final class FluxArray<T> extends Flux<T> implements Fuseable, SourceProducer<T> {
    ...
    public static <T> void subscribe(CoreSubscriber<? super T> s, T[] array) {
        if (array.length == 0) {
            Operators.complete(s);
        } else {
            if (s instanceof ConditionalSubscriber) {
                s.onSubscribe(new FluxArray.ArrayConditionalSubscription((ConditionalSubscriber)s, array));
            } else {
                s.onSubscribe(new FluxArray.ArraySubscription(s, array));
            }
        }
    }
    ...
}
~~~
`MonoJust`의 `subscribe` 메소드와 거의 동일하다. 그리고 두가지 `Subscription`이 있다.

~~~ java
public void request(long n) {
    if (Operators.validate(n) && Operators.addCap(REQUESTED, this, n) == 0L) {
        if (n == 9223372036854775807L) {
            this.fastPath();
        } else {
            this.slowPath(n);
        }
    }

}
~~~

> Subscription의 request를 조절하고 싶다면 LambdaSubscriber에서 (success, error, complete)에서 4번째 인자로 subscription을 받는 람다를 추가하면 된다.

기본적으로 `request`는 `9223372036854775807L`개(`Long.MAX`)를 요청하기때문에 `fastPath`가 호출되고, `Subscription`을 통해 `request`를 제어 헀다면 `slowPath`가 호출된다.

~~~ java
void fastPath() {
    T[] a = this.array;
    int len = a.length;
    Subscriber<? super T> s = this.actual;

    for(int i = this.index; i != len; ++i) {
        if (this.cancelled) {
            return;
        }

        T t = a[i];
        if (t == null) {
            s.onError(new NullPointerException("The " + i + "th array element was null"));
            return;
        }

        s.onNext(t);
    }

    if (!this.cancelled) {
        s.onComplete();
    }
}
~~~
`fastPath`의 data를 **Stream으로 전달하는 방법**은 **for**문을 돌면서 모든 data를 하나씩 전달한다. `slowPath`는  **요청한 갯수만 Stream으로 전달**한다.

**fastPath는 요청한 갯수가 아니라 사실상 모든 data를 전달하고 slowPath는 요청한 갯수만큼만 전달한다.** 그리고 slowPath는 이전 요청에 이어서 추가로 요청이 가능하도록 구현되어 있다.

~~~ java
Flux.just("1", "2", "3", "4", "5", "6")
    .subscribe(r -> {
        System.out.println(r);
    }, null, null, subscription -> {
        subscription.request(2);
        // more
        subscription.request(2);
    });

// 출력
1
2
3
4
~~~
`subscription.request(2)`에 의해서 **2개만 요청**되고 **한번더 호출**되면 그 다음 **이어서 2개를 요청**한다. 내부적으로 `index`를 저장하고 있기 때문에 이어서 요청이 가능하다.
