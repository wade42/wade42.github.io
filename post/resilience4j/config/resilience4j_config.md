# Resilience4j Config 설명



### failureRateThreshold
failure 비율로 1 부터 100 까지 설정한다.
Closed 상태일 경우에는 계속해서 계산된다. (default: 50.0F)

###  slowCallRateThreshold
slow call 비율로 1부터 100까지 설정할 수 있다.
(default: 100.0F)

### writableStackTraceEnabled
Excpetion 발생시 trace 내용이 담겨져 있다.
false 설정시 getStackTrace는 비어 있는 상태로 반환 되며, Exception을 이미 알고 있으며 Open 상태일 때 log의 리소스를 줄이기 위해서 사용될 수 있다. (default: true)

> [주석 참고](https://github.com/resilience4j/resilience4j/blob/master/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/CircuitBreakerConfig.java)

### waitDurationInOpenState
Open 상태일경우 일정시간 지연을 준다.
설정된 시간이 지난 후에는 Half Open 상태가 된다.
Half Open 상태에서 Closed 상태로 전환되면 기록된 수치는 다시 초기화된다. (default: 60 seconds)

### slowCallDurationThreshold
slow call을 판단하는 시간 설정이다. 설정된 시간보다 오래 걸리는 call은 slow call로 판단하고 slow call percentage를 증가 시킨다.
(default: 60 seconds)

### permittedNumberOfCallsInHalfOpenState
Half Open 상태일 경우 허용되는 call 수다.
만약 permittedNumberOfCallsInHalfOpenState 이 minimumNumberOfCalls 보다 크다면 minimumNumberOfCalls 로 설정된다..
half open 상태에서 설정된 permittedNumberOfCallsInHalfOpenState 수 만큼 요청이 왔을 경우
failureRate을 계산해서 failureRateThreshold 보다 높지 않다면 Closed 상태로,
높다면 Open 상태로 변경 된다. (default: 10)

### slidingWindowSize
각 요청이 기록될 Buffer 사이즈다.
minimumNumberOfCalls에 영향 없이 설정된 수만큼 Buffer가 설정됨.
(default: 100)

### slidingWindow
slidingWindowSize, minimumNumberOfCalls, slidingWindowType 을 한번에 설정한다.
내부적으로 type이 count 일경우 minimumNumberOfCalls은 slidingWindowSize, minimumNumberOfCalls 둘중 작은 값으로 설정 된다.

### minimumNumberOfCalls
최소로 기록 되어야 할 수로 설정된 수만큼 적어도 기록이 되야 되한다. 설정된 수치 까지 기록이 되지 않을 경우에는 FailureRate 계산과 State가 변경되지 않는다. slidingWindowSize 제외한 다른 설정값들에 영향을 준다. (default: 100)

### slidingWindowType
기록을 관리하는 Metrix는 두가지 Type을 제공한다. 설정된 시간만큼 기록을 하는 TIME_BASED와 설정된 수 만큼 기록하는 COUNT_BASED Type이다. (default COUNT_BASED)


### automaticTransitionFromOpenToHalfOpenEnabled
true로 설정 하게 되면 waitDurationInOpenState 설정된 만큼 일정 시간이 지나면 자동으로 open에서 half open 상태로 변경된다.
default는 false로 
open 상태에서 waitDurationInOpenState 설정된 시간 이후 아무런 요청이 없다면 상태는 바뀌지 않으며, 요청이 있을 시에만 Half Open으로 바꾼다.

### recordExceptions, ignoreExceptions
두 메소드를 통해 특정 Exception을 제외 또는 기록 할 수 있다.

## 출처
* [공식문서](https://resilience4j.readme.io/docs/circuitbreaker)