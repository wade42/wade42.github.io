# CircuitBreaker 종류 (Basic, BulkHead, RateLimiter)

* **CircuitBreaker**
* **BulkHead**
* **RateLimiter**

크게는 3가지 종류가 있으며 사용법은 대부분 동일하다.
제공하는 서비스나 정책에 맞게 사용하면 된다.

# CircuitBreaker Basic
**성공**과 **실패**를 기록하여 **FailureRate**을 계산한다. 이 **FailureRate**에 의해 **State**가 결정된다. 그리고 **State에 따라 요청을 처리하거나 처리하지 않는다.**

State은 기존적으로 다음과 같다.
* **Closed**
* **Open**
* **Half Open**

기록 되는 방식 또한 2가지 **설정된 시간만큼씩의 기록을 누적**하여 FailureRate을 계산하는 방법과 **설정된 수 만큼씩의 기록을 누적**하여 FailureRate을 계산하는 방법이 있다.

> 자세한 설명은 [공식문서](https://resilience4j.readme.io/docs/circuitbreaker)

# Bulkhead
기본적인  `Circuitbreaker` 와는 달리 `Bulkhead`는 리소스 관점으로 보는게 맞다. 실패율은 중요하지 않으며
**동시 처리량**에 관점을 둔다. 설정된 Threshold를 넘지 않게 하며, 어플리케이션을 다운되게 하지 않거나, 최대한 다른 동작에 영향을 주지 않게 하기 위함이다.

요청이 많은 handler와 적은 handler에 각각 설정하여 영향을 최소화 시킬수 있다.

설정 방법이나 내부 동작 및 구조는 기본형태와 동일 하며 `Permission`을 획득하는 방법만 조금 다르다.

기본적으로 `Bulkhead`는 `SemaphoreBulkhead`이다.
Java **Semaphore**를 사용(동시에 실행될 수 있는 maxCalls가 설정된다. default: 25)하며 **Semaphore**로 `tryAcquire` 또는 `release`를 통해 자원을 관리하게 된다.

만약 자원이 없을시 다음과 같은 메시지가 출력된다.
~~~ java
{reason=Bulkhead 'bulkPromoBreaker' is full and does not permit further calls}
~~~

> ThreadPoolBulkead도 동일하다.


# RateLimiter
`RateLimiter`를 사용하면 **초당 처리량**을 제한 할 수 있다.
정해진 시간에 정해진 건수만 처리 되도록 보장 할 수 있고, 일정 시간 뒤에 다시 초기화 되어 처리량을 유지 한다.
지정할 수 있는 옵션은 3가지 이다.

~~~ java
.timeoutDuration(Duration.ofSeconds(5)) 
// permition 받을 때까지 대기하는 시간
.limitRefreshPeriod(Duration.ofSeconds(10))
.limitForPeriod(3)
~~~

`timeoutDuration`은 `LockSupport`을 이용하여 설정된 초동안 대기하게 한다.
이설정을 최소로(milis 단위로) 하고
~~~ java
.limitRefreshPeriod(Duration.ofSeconds(10))
.limitForPeriod(3)
~~~
로 설정한다면 정확하게 10초 동안 먼저온 3건만 처리하고 나머지는 **reject** 된다.


