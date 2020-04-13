# Reilience4j 동작 과정 (Acquire Permission)
내부적으로 어떻게 판단되고 계산되는지 확인해본다. 내부동작은 Ractor 위주로 설명했다.
참고로 `CircuitBreaker`의 `Status`는 하나의 **링버퍼**로, 하나의 **고리**라고 생각하면 이해하기 쉽다.

## 어떻게 기록되는가
### Reactor
*  **Publisher (Operator)**
~~~ java
class MonoCircuitBreaker<T> extends MonoOperator<T, T> {
    ...
    public void subscribe(CoreSubscriber<? super T> actual) {
        // permission 획득
        if (this.circuitBreaker.tryAcquirePermission()) { 
            this.source.subscribe(new CircuitBreakerSubscriber(this.circuitBreaker, actual, false));
        } else {
            Operators.error(actual, CallNotPermittedException.createCallNotPermittedException(this.circuitBreaker));
        }
}
~~~
인자로 넘겨받은 `CircuitBreaker`의 `tryAcquirePermission`를 호출하여 **현재 사용가능한 Status인지 Check** 한다. **Status**가 **Closed** 또는 **Half Closed** 상태인 경우에는 `CircuitBreakerSubscriber`를 생성하여 **구독**시킨다. 이때 `CircuitBreakerSubscriber`에 **downstream**이 전달된다. 만약 현재 **Open** 상태인 경우에는 `CallNotPermittedException`이 발생한다.

* **Subscriber**
~~~ java
class CircuitBreakerSubscriber<T> extends AbstractSubscriber<T> {
    protected CircuitBreakerSubscriber(CircuitBreaker circuitBreaker, CoreSubscriber<? super T> downstreamSubscriber, boolean singleProducer) {
        super(downstreamSubscriber);
        ...
        this.start = System.nanoTime();
    }
    ...
    // 성공시
    protected void hookOnNext(T value) {
        ...
        this.circuitBreaker.onSuccess(System.nanoTime() - this.start, TimeUnit.NANOSECONDS);
    }

    // 실패시
    protected void hookOnError(Throwable e) {
        ...
        this.circuitBreaker.onError(System.nanoTime() - this.start, TimeUnit.NANOSECONDS, e);
    }
    ...
}
~~~
`upstream`의 결과와 `elapse time`을 기록한다. 참고로 `elapse time`은 `CircuitBreakerSubscriber`가 생성되는 시점에 (Operator들을 조립할때) `this.start`가 초기화 된다. `Subscriber`의 `onSubscribe` 구독을 거쳐 `upstream`들의  `On` 또는 `hookOn` 메소드가 모두 실행될때 까지 계산된다. 
**즉, Stream의 생성 부터 CircuitBreaker의 upstream들의 실행시간이라고 봐도 된다.**
> 다른 상황(hookOnComplete, hookOnCancel 등)에서도 기록된다.

### Decorator (CircuitBeaker Basic)
~~~ java
static <T> CheckedFunction0<T> decorateCheckedSupplier(CircuitBreaker circuitBreaker, CheckedFunction0<T> supplier) {
        return () -> {
            // permission 획득
            circuitBreaker.acquirePermission();
            ...
            try {
                ...
                // 비지니스 로직 실행
                T returnValue = supplier.apply();
                // 성공시
                circuitBreaker.onSuccess(durationInNanos, TimeUnit.NANOSECONDS);
                ...
            } catch (Exception var7) {
                ...
                // 실패시
                circuitBreaker.onError(durationInNanos, TimeUnit.NANOSECONDS, var7);
                ...
            }
            ...
        };
}
~~~

결국 `Rx`, `Reactor` 에서 `Publisher`(`Operator`)나, `CircuitBreaker`의 `Decorate`을 사용할때 **공통적으로 `tryAcquirePermission`을 호출하여 현재 이용가능한 상태인지 확인한 후 비지니스로직의 실행 결과에 따라서 onSuccess 또는 onError로 elapse time과 exception을 전달하게 되어 있다.**

그렇다면 내부적으로 어떻게 판단 되고 변경되는지 알아보자.


## CircuitBreakerState

* **HalfOpenState**
* ForcedOpenState
* DisabledState
* **OpenState**
* **ClosedState**

`CircuitBreaker`의 State는 다음과 같은 클래스들이 있다. 그리고 각 State 클래스에는 `CircuitBreakerMetrics` 클래스가 있어 수치가 기록된다.

~~~ java
private final AtomicReference<CircuitBreakerStateMachine.CircuitBreakerState> stateReference;
~~~
`CircuitBreaker`는 `CircuitBreakerState`를 `AtomicReference`에 `wrapping`하여 보관된다. 이 말은 `CircuitBreaker`의 상태를 **Atomic** 하게 업데이트 하기 위함이고, `AtomicReference`의 `getAndUpdate`를 통해서 `State` 클래스를 생성하여 업데이트 된다.

~~~ java
closed -> open -> half open -> closed or open
~~~
**CircuitBreaker Pattern**에서 **State**는 위와 같이 변경된다.

코드상에서 `CircuitBreaker`의 **State**가 변한다는 것은 `AtomicReference`가 update 된다는 것이다.

~~~ java
this.stateReference = new AtomicReference(new CircuitBreakerStateMachine.ClosedState());
~~~
그리고 `CircuitBreaker`의 `AtomicReference`는 최초에 `ColsedState`으로 초기화된다. (즉, `Circuitbreaker`의 초기 상태는 **Closed** 이다.)

~~~ java
public boolean tryAcquirePermission() {
    boolean callPermitted = ((CircuitBreakerStateMachine.CircuitBreakerState)this.stateReference.get()).tryAcquirePermission();
    if (!callPermitted) {
        this.publishCallNotPermittedEvent();
    }

    return callPermitted;
}
~~~
`Circuitbreaker`에서 `tryAcquirePermission`을 호출을 하면 현재 설정된 `CircuitBreakerState`의 `tryAcquirePermission`을 호출 하게 된다.

각 CircuitBreakerState 클래스에서 어떻게 Permission(현재 이용가능한 상태)을 판단하는지 살펴보자.

#### ClosedState (Closed)
~~~ java
public boolean tryAcquirePermission() {
    return this.isClosed.get();
}
~~~
현재 **isClosed**(`AtomicBoolean`) 되었는지 확인 후 반환한다.

~~~ java
public void onError(long duration, TimeUnit durationUnit, Throwable throwable) {
    this.checkIfThresholdsExceeded(this.circuitBreakerMetrics.onError(duration, durationUnit));
}

public void onSuccess(long duration, TimeUnit durationUnit) {
    this.checkIfThresholdsExceeded(this.circuitBreakerMetrics.onSuccess(duration, durationUnit));
}
~~~
`CircuitBreakerSubscriber`에서 성공 또는 실패시  `Circuitbreaker`를 통해 호출되는 메소드이다.
`CircuitBreakerMetrics`의 `onSuccess` 또는 `onError`가 호출되며 `Metrics` 내부에 기록이 된다. 그리고 기록될때마다 **FailureRate**를 계산하여 설정된 **Thresholds**와 비교 후 **Result Type**을 반환한다. 

> Metrics에서 Thresholds Check는 minimumNumberOfCalls 만큼 요청이 되었을 때부터 계산된 FailureRate을 리턴한다. minimumNumberOfCalls 보다 요청량이 작다면 BELOW_MINIMUM_CALLS_THRESHOLD이 반환된다.

> minimumNumberOfCalls는 default 100이며 slidingWindowSize 보다 클경우 slidingWindowSize로 설정된다.

~~~ java
private void checkIfThresholdsExceeded(Result result) {
    if (result == Result.ABOVE_THRESHOLDS && this.isClosed.compareAndSet(true, false)) {
        CircuitBreakerStateMachine.this.transitionToOpenState();
    }
}
~~~
결국 **Result Type**에 따라서 상태가 변경되게 되는데, 설정된 **FailureRate** 보다 높아지면 `Result.ABOVE_THRESHOLDS Type`을 반환되어 조건이 충족되게 된다. 그리고 `isClosed`를 **false**로 **update** 한다. `isClosed`가 **update** 되면 이제 `tryAcquirePermission` 메소드에서 **false**가 리턴되게 된다.

그리고 현재 `CircuitBreaker`의 **State**를 **OpenState(Open)** 으로 변경한다.

#### OpenState (Open)
생각보다 흥미로운 로직들이 있다.
참고로 `CircuitBreaker`에는 `Clock` 멤버변수를 가지고 있다.

~~~ java
this.retryAfterWaitDuration = CircuitBreakerStateMachine.this.clock.instant().plus(waitDurationInMillis, ChronoUnit.MILLIS);
~~~
duration time을 설정한다.

~~~ java
public boolean tryAcquirePermission() {
    if (CircuitBreakerStateMachine.this.clock.instant().isAfter(this.retryAfterWaitDuration)) {
        this.toHalfOpenState();
        return true;
    } else {
        this.circuitBreakerMetrics.onCallNotPermitted();
        return false;
    }
}
~~~
**Open** 상태는 요청이 **reject** 되는 **error**인 상태이다.
그리고 **Open** 상태는 사용자가 설정된 시간 이후에 **HalfOpenState(Half Open)** 으로 변경된다.

#### HalfOpenState(Half Open)
**Half Open** 상태에서는 **Closed** 또는 **Open** 두가지 상태로 변경될 수 있다.

~~~ java
this.permittedNumberOfCalls = new AtomicInteger(permittedNumberOfCallsInHalfOpenState);
~~~
`HalfOpenState`의 `slidingWindowSize`는 `Config`에서 `permittedNumberOfCallsInHalfOpenState`으로 설정 된다. 따로 설정하지 않으면 기본적으로 10 이다. 그리고 `minimumNumberOfCalls`는 설정된 값과 `slidingWindowSize`와 비교하여 작은 값으로 설정된다.

> Metrics에서 Thresholds Check는 minimumNumberOfCalls 만큼 요청이 되었을 때부터 계산된 FailureRate을 리턴한다. minimumNumberOfCalls 보다 요청량이 작다면 BELOW_MINIMUM_CALLS_THRESHOLD이 반환된다.

> minimumNumberOfCalls는 default 100이며 slidingWindowSize 보다 클경우 slidingWindowSize로 설정된다.

~~~ java
public boolean tryAcquirePermission() {
    if (this.permittedNumberOfCalls.getAndUpdate((current) -> {
        int var10000;
        if (current == 0) {
            var10000 = current;
        } else {
            --current;
            var10000 = current;
        }

        return var10000;
    }) > 0) {
        return true;
    } else {
        this.circuitBreakerMetrics.onCallNotPermitted();
        return false;
    }
}
~~~
count를 줄여가면서 `permittedNumberOfCalls`에 설정된 수치 만큼만 허용하게 되어있다.

~~~ java
public void onError(long duration, TimeUnit durationUnit, Throwable throwable) {
    this.checkIfThresholdsExceeded(this.circuitBreakerMetrics.onError(duration, durationUnit));
}

public void onSuccess(long duration, TimeUnit durationUnit) {
    this.checkIfThresholdsExceeded(this.circuitBreakerMetrics.onSuccess(duration, durationUnit));
}
~~~
허용된 요청에 대한 결과에 따라서 수치를 기록한다.

~~~ java
private void checkIfThresholdsExceeded(Result result) {
    if (result == Result.ABOVE_THRESHOLDS && this.isHalfOpen.compareAndSet(true, false)) {
        CircuitBreakerStateMachine.this.transitionToOpenState();
    }

    if (result == Result.BELOW_THRESHOLDS && this.isHalfOpen.compareAndSet(true, false)) {
        CircuitBreakerStateMachine.this.transitionToClosedState();
    }

}
~~~
`minimumNumberOfCalls` <= `permittedNumberOfCalls` 이기 때문에 `minimumNumberOfCalls`만큼 도달 하였을 경우 계산된 **FailureRate**으로 **Result Type**을 반환한다. `ABOVE_THRESHOLDS` 일 경우에는 다시 **OepnState**으로 변경되고, `BELOW_THRESHOLDS`일 경우는 **ClosedState**으로 변경된다.

**Result에 따라서 두가지 상태로 변경된다.**

그럼 어떻게 Metrics에 기록되가.

## SlidingWindowType
`CircuitBeaker`의 `State`를 결정하기 위해 사용되는 `Metrics`는 두가지가 있다.

* TIME_BASED (SlidingTimeWindowMetrics)
* COUNT_BASED (FixedSizeSlidingWindowMetrics)

두 `Metrics`는 기록되는 방식에 차이가 있다. 때문에 어떤 `Metrics`를 사용하는지에 따라 **FailureRate**이 달라 질 수 있다.

두 타입 모두 큰 구조는 동일하다. 총 기록이 **누적되는 변수**가 있고, 설정된 만큼의 기록을 하기위한 **Buffer**를 가지고 있다.
그리고 누적 변수와 **Buffer**에 기록되고 초기화되면서 **RailureRate**을 계산한다.

### TIME_BASED (SlidingTimeWindowMetrics)
**설정된 시간동안 만큼의 기록만 유지되는 방법이다.**
`CircuitBreakerConfig`에서 설정되는 `slidingWindowSize`값은 **기록이 유지되는 Seconds**로 사용된다. 
**따라서 계산되는 FailureRate은 slidingWindowSize초간의 기록으로 낸 통계가 된다.**

내부를 살펴 보자.

~~~ java
private final TotalAggregation totalAggregation;
~~~
`TotalAggregation`에 기록이 누적되며, **FailureRate**을 계산하는데 사용된다.

~~~ java
final PartialAggregation[] partialAggregations;
~~~
기록이 보관되는 (`Ring`)`Buffer`이다. 설정된 `windowSize` 만큼 크기를 갖는다.

~~~ java
this.partialAggregations = new PartialAggregation[timeWindowSizeInSeconds];
long epochSecond = clock.instant().getEpochSecond();

for(int i = 0; i < timeWindowSizeInSeconds; ++i) {
    this.partialAggregations[i] = new PartialAggregation(epochSecond);
    ++epochSecond;
}
~~~
현재 시간의 `EpochSecond`를 이용하여 `Buffer`를 초기화 한다. 이때 `EpochSecond`를 증가시키며 `PartialAggregation`를 생성하게 한다. 그러면 현재 시간부터 **+windowSize** 초 만큼 각 증가된 `Buffer`가 미리 셋팅된다.
 
`record` 메소드를 살펴보자.

~~~ java
public synchronized Snapshot record(long duration, TimeUnit durationUnit, Outcome outcome) {
    this.totalAggregation.record(duration, durationUnit, outcome);
    this.moveWindowToCurrentEpochSecond(this.getLatestPartialAggregation()).record(duration, durationUnit, outcome);
    return new SnapshotImpl(this.totalAggregation);
}
~~~

`TotalAggregation`에 먼저 기록을 한후 `headIndex`의 `PartialAggregation`를 가져와 `moveWindowToCurrentEpochSecond` 메소드에서 `EpochSecond`를 검사 후 기록된다.

`moveWindowToCurrentEpochSecond`의 과정은 다음과 같다.

선택된 `PartialAggregation`에서 바로 기록 하지 않고 `PartialAggregation`의 **EpochSecond**와 **현재 EpochSecond**를 비교한다. 

만약 같다면 현재시간으로 기록될 `PartialAggregation`이 맞으므로 선택된 `PartialAggregation`를 반환한다.
만약 같지 않다면, **현재 EpochSecond**과 `PartialAggregation`의 **EpochSecond** **시간차**를 구하고, 그 시간차만큼 `Buffer`를 재 초기화 한다.

다음은 그 과정이다.


~~~ java
long differenceInSeconds = currentEpochSecond - latestPartialAggregation.getEpochSecond();
long secondsToMoveTheWindow = Math.min(differenceInSeconds, (long)this.timeWindowSizeInSeconds);
~~~
현재시간과 선택된 `PartialAggregations`의 시간차이는 설정된 `timeWindowSizeInSeconds`(`slidingWindowSize`)를 넘을 수 없다.

~~~ java
PartialAggregation currentPartialAggregation;
do {
    --secondsToMoveTheWindow;
    this.moveHeadIndexByOne();
    currentPartialAggregation = this.getLatestPartialAggregation();
    this.totalAggregation.removeBucket(currentPartialAggregation);
    currentPartialAggregation.reset(currentEpochSecond - secondsToMoveTheWindow);
} while(secondsToMoveTheWindow > 0L);
~~~
해당 시간 차이만큼 do while을 돌며 **EpochSecond을 1초씩 증가하게, 마지막이 현재시간이 되도록 partialAggregations을 초기화** 시킨다. 초기화 될때 해당 `partialAggregation`에 누적되어 기록된 수치들은 `TotalAggregation`에서 제거 된다. 지난 기록들을 제거 하는 과정이다.

그리고 **현재 EpochSecond**로 셋팅된 `currentPartialAggregation`을 리턴 한다.

만약 시간차가 timeWindowSizeInSeconds 이상 나게 되면, 모든 루프가 초기화가 된다. 이 경우에는 slidingWindowSize 만큼 시간 이상이 지났기 때문에 이전 기록들을 모두 초기화하는 작업이된다.

요청이 최소 초당 1번 이상이 오게 된다면, 루프는 초당 한번씩만 실행 되게 되며, 
시간 차가 적거나 많아도 초당 루프의 실행횟수를 계산해보면 초당 한번 이하로 도는 셈이다.

~~~ java
public synchronized Snapshot record(long duration, TimeUnit durationUnit, Outcome outcome) {
    ..
    return new SnapshotImpl(this.totalAggregation);
}
~~~
이렇게 기록이 된 `totalAggregation`을 `Snapshot` 객체로 만들어 반환 한다.

~~~ java
public class SnapshotImpl implements Snapshot {
    ...
    public float getFailureRate() {
        return this.totalNumberOfCalls == 0 ? 0.0F : (float)this.totalNumberOfFailedCalls * 100.0F / (float)this.totalNumberOfCalls;
    }
    ...
}
~~~
`Snapshot`에서 **FailerRate**을 계산한다.
그리고 이 수치로 `Metrics`에서 판단하여 `Result Type`을 결정하게 된다.

> 참고로 record 메소드에는 synchronized 처리가 되어 있다.


### COUNT_BASED (FixedSizeSlidingWindowMetrics)
**설정된 수의 기록만 유지되는 방법이다.** 기본으로 설정되는 `Metrics Type` 이다.
내부는 생각보다 간단하다.

~~~ java
private final TotalAggregation totalAggregation;
~~~
`TotalAggregation`에 기록이 누적되며, **FailureRate**을 계산하는데 사용된다.

~~~ java
private final Measurement[] measurements;
this.measurements = new Measurement[this.windowSize];
for(int i = 0; i < this.windowSize; ++i) {
    this.measurements[i] = new Measurement();
}
~~~
기록이 보관되는 (`Ring`)`Buffer`이다. 설정된 `windowSize` 만큼 크기를 갖는다.

record 메소드를 살펴보자

~~~ java
public synchronized Snapshot record(long duration, TimeUnit durationUnit, Outcome outcome) {
    this.totalAggregation.record(duration, durationUnit, outcome);
    this.moveWindowByOne().record(duration, durationUnit, outcome);
    return new SnapshotImpl(this.totalAggregation);
}
~~~
먼저 `TotalAggregation`에 먼저 기록 한다.
그리고 `headIndex`를 증가시켜 기록될 `Measurement`를 가져와서 기록 하게 된다.

`Measurement`를 선택되는 과정은 다음과 같다.

~~~ java
private Measurement moveWindowByOne() {
    this.moveHeadIndexByOne();
    Measurement latestMeasurement = this.getLatestMeasurement();
    this.totalAggregation.removeBucket(latestMeasurement);
    latestMeasurement.reset();
    return latestMeasurement;
}
~~~
증가시킨 `index`의 `Measurement`에 기록된 수치를 `totalAggregation`에서 **제거**한 후에
해당 `Measurement`를 **reset 후 반환**된다. 그러면 초기화된 `Measurement`로 새로 기록이 된다.

~~~ java
public synchronized Snapshot record(long duration, TimeUnit durationUnit, Outcome outcome) {
    ...
    return new SnapshotImpl(this.totalAggregation);
}
~~~
이렇게 기록이 된 `TotalAggregation`을 `Snapshot` 으로 만들어 반환 한다.

~~~ java
public float getFailureRate() {
    return this.totalNumberOfCalls == 0 ? 0.0F : (float)this.totalNumberOfFailedCalls * 100.0F / (float)this.totalNumberOfCalls;
}
~~~
`Snapshot` 객체에서 `FailerRate`을 계산한다.
그리고 이 수치로 `Metrics`에서 판단하여 `Result Type`을 결정하게 된다.

