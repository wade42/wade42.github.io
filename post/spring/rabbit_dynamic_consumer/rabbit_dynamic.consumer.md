# [Spring] spring-rabbit(RabbitMQ)이 Consumer를 동적으로 관리하는 방법

여기서는 내부적으로 어떻게 RabbitMQ **Consumer(Thread)** 를 관리하는지 살펴 본다.
amqp의 자세한 사용법에 대해서 설명 하지는 않는다.

사용법은 공식문서 참고!
> [공식 문서](https://docs.spring.io/spring-amqp/reference/html)

> spring-amqp, spring-rabbit version은 2.2.2 이다.


~~~ java
@Bean
    public SimpleMessageListenerContainer myContainer(){
        SimpleMessageListenerContainer container = new SimpleMessageListenerContainer();
        container.setConnectionFactory(connectionFactory());
        container.setQueueNames(QUEUE_NAME);
        container.setQueues(feedbackQueue());
        container.setMessageListener(this.myMQListener);  
        // add amazon sender aware listener
        container.setConcurrentConsumers(10);
        container.setMaxConcurrentConsumers(30);
        container.setAcknowledgeMode(AcknowledgeMode.MANUAL); 
        //  the listener must acknowledge all messages by calling ack
        container.setReceiveTimeout(3000L);
        container.setRecoveryInterval(3000L);
        return container;
    }

~~~

`MessageListener`가 실행될 `Container` 설정에서, `Consumer` 설정 중 
**concurrentConsumer**와 **maxconcurrentConsumer** 설정을 할 수가 있다.
**concurrentConsumer**는 실행되는 최소 **Consumer(Thread)** 의 수이고
**maxconcurrentConsumer**는 최대로 실행될 수 있는 Consumer(Thread)의 수 이다.

`SimpleMessageListenerContainer`가 Bean에 등록되어 `Container`가 구동이 되면 몇가지 셋팅을 한다.

~~~ java
protected int initializeConsumers() {
	…
	this.consumers = new HashSet(this.concurrentConsumers);

    for(int i = 0; i < this.concurrentConsumers; ++i) {
        BlockingQueueConsumer consumer = this.createBlockingQueueConsumer();
        this.consumers.add(consumer);
        ++count;
    }
    …
}
~~~
먼저 설정된 **concurrentConsumers** 만큼 미리 `BlockingQueueConsumer`를 미리 생성한다.

~~~ java
Iterator var4 = this.consumers.iterator();

while(var4.hasNext()) {
    BlockingQueueConsumer consumer = (BlockingQueueConsumer)var4.next();
    SimpleMessageListenerContainer.AsyncMessageProcessingConsumer processor = new SimpleMessageListenerContainer.AsyncMessageProcessingConsumer(consumer);
    processors.add(processor);
    this.getTaskExecutor().execute(processor);
…
}
~~~

그리고 각 `Consumer`들은 `SimpleMessageListenerContainer.AsyncMessageProcessingConsumer`로 한번 더 wrapping 된다.
`BlockingQueueConsumer`는 **실제로 RabbitMQ 서버와 통신을 담당하고 받아온 데이터를 보관하는 큐를 가지고 있다.**
`SimpleMessageListenerContainer.AsyncMessageProcessingConsumer`는 `BlockingQueueConsumer`를 **동적으로 관리하기 위한 역할**을 한다.

그리고 각 `AsyncMessageProcessingConsumer`는 `SimpleAsyncTaskExecutor`에 의해서 실행된다.

`AsyncMessageProcessingConsumer`가 실행되면 `BlockingQueueConsumer`를 **init** 및 **start** 시킨다.

참고로 RabbitMQ 같은 경우는 Kafka와는 다르게 **Prefetch** 가있다.
**설정된 prefetchCount 만큼 MQ서버에서 message를 push**한다. 그리고 application에서는 Consumer의 Queue에 message들을 담아 두고 Conusmer가 하나씩 처리하게된다.

~~~
this.channel.basicQos(this.prefetchCount);
~~~
`BlockingQueueConsumer`가 **start** 되면 `Consumer`에 할당된 `RabbitMQ Client Channel`에 설정된 **prefetchCount**로 **basicQos**가 설정된다.


> [prefetch에 대해서 잘 성명된 글](https://velog.io/@minholee_93/RabbitMQ-Prefetch-5vk4w9gi9k)

> [Prefetch 공식문서](https://www.rabbitmq.com/consumer-prefetch.html)

> [rabbitmq(push model) vs kafka(pull model)](https://jack-vanlightly.com/blog/2017/12/4/rabbitmq-vs-kafka-part-1-messaging-topologies)



~~~ java
public static final int DEFAULT_PREFETCH_COUNT = 250;
~~~
참고로 default prefetch count는 250이다.


그리고 가장 중요한 부분이다.

~~~ java
while(SimpleMessageListenerContainer.this.isActive(this.consumer) || this.consumer.hasDelivery() || !this.consumer.cancelled()) {
    this.mainLoop();
}
~~~
동적으로 **Consumer(Thread)** 를 관리하는 핵심이 `mainLoop` 메소드에 있다.
현재 `BlockingQueueConsumer`가  Active 상태거나, Queue가 empty가 아니 거나(hasDelivery), 또는 channel에 이슈가 없다면 `mainLoop`를 계속해서 실행하게 된다.

`mainLoop`을 살펴보면
~~~ java
private void mainLoop() throws Exception {
    try {
        boolean receivedOk = SimpleMessageListenerContainer.this.receiveAndExecute(this.consumer);
        if (SimpleMessageListenerContainer.this.maxConcurrentConsumers != null) {
            this.checkAdjust(receivedOk);
        }
	…
}
~~~

`receiveAndExecute`는 **betchSize(fetchCount)** 만큼 `for`문을 돌며 message를 하나씩 처리 한다.

**betchSize** 만큼 모두 message를 받아와서 처리 했다면, **true**를 반환하고, 처리할 message가 없거나, **betchSize**보다 작다면 **false**를 반환 한다. 

그리고 이 반환된 결과에 따라서, `Consumer`를 증가 또는 중지 여부가 `checkAdjust`메소드에서 결정된다. 
> 단, maxConcurrentConsumers가 설정되있어야 한다.

~~~ java
private void checkAdjust(boolean receivedOk) {
    if (receivedOk) {
        if (SimpleMessageListenerContainer.this.isActive(this.consumer)) {
            this.consecutiveIdles = 0;
            if (this.consecutiveMessages++ > SimpleMessageListenerContainer.this.consecutiveActiveTrigger) {
                SimpleMessageListenerContainer.this.considerAddingAConsumer();
                this.consecutiveMessages = 0;
            }
        }
    } else {
        this.consecutiveMessages = 0;
        if (this.consecutiveIdles++ > SimpleMessageListenerContainer.this.consecutiveIdleTrigger) {
            SimpleMessageListenerContainer.this.considerStoppingAConsumer(this.consumer);
            this.consecutiveIdles = 0;
        }
    }

}
~~~

먼저 **Consumer가 증가하는 경우**를 살펴 보자.

`checkAdjust` 메소드를 살펴보면, **betchSize(prefetchCount)** 만큼 모두 실행한 뒤, `consecutiveMessages`를 먼저 `consecutiveActiveTrigger` 값과 **비교 후 증가**시킨다. 

만약 `consecutiveActiveTrigger` 값보다 클 경우에는 `considerAddingAConsumer` 메소드를 통해 **Consumer를 새로 추가** 한다. 

> consecutiveActiveTrigger는 기본적으로 10으로 설정되있다.

**즉, mainLoop 메소드가 10번 이상 연이어서 실행되고, 모두 betchSize(fetchCount)만큼 계속해서 처리 했다면 Conusmer를 증가시킬 수 있는 상황으로 판단한다.**

그리고 여기서 한번더 검사한다.

~~~ java
private void considerAddingAConsumer() {
    Object var1 = this.consumersMonitor;
    synchronized(this.consumersMonitor) {
        if (this.consumers != null && this.maxConcurrentConsumers != null && this.consumers.size() < this.maxConcurrentConsumers) {
            long now = System.currentTimeMillis();
            if (this.lastConsumerStarted + this.startConsumerMinInterval < now) {
                this.addAndStartConsumers(1);
                this.lastConsumerStarted = now;
            }
        }

    }
}
~~~

`lastConsumerStarted` 값에 `startConsumerMinInterval` 더한 값보다 현재시간이 더 크다면, 즉 `마지막 Consumer`를 생성한 후에도 일정 시간이상 동안 계속해서 연이어서 처리되고 있는 상황이라면, 최종적으로 Consumer가 새로 추가된다.
> 참고로 lastConsumerStarted는 volatile로 설정되어 있기 때문에 모든 Consumer Thread와 최신 상태 값으로 공유된다. 전체 Conumser와 상태를 공유 하기 위함.
startConsumerMinInterval는 default가 10000L(mills 이기때문에 10초)이다. 

***추가되는 경우를 정리하면, Conusmer는 설정된 consecutiveActiveTrigger값 이상으로 연이어서 batchSize(prefetchCount) 만큼 실행되고 
이 상태가 startConsumerMinInterval 이상 동안 유지 된다면 Consumer가 1개씩 maxConcurrentConsumers 까지 증가하게 된다.***

그럼 이제 **Conumser 중지 및 해제되는 경우**를 살펴보자.

다시 `checkAdjust` 메소드를 살펴보면, **batchSize(prefetchCount)** 만큼 실행되지 않으면, `consecutiveMessages`를 **0**으로 초기화 시키고 `consecutiveIdles`와 `consecutiveIdleTrigger`값과 **비교 후 증가** 시킨다. 만약 `consecutiveIdles`값이 더 크다면 `considerStoppingAConsumer` 메소드를 통해 **Consumer를 중지** 시킨다. 
> consecutiveIdleTrigger는 기본적으로 10으로 설정되있다.

**즉, mainLoop 메소드가 10번 이상 연이어서 실행되고, 모두 betchSize(prefetchCount)만큼 처리하지 않았다면 Conusmer를 중지시킬 수 있는 상황으로 판단한다.**

그리고 역시 `considerStoppingAConsumer` 메소드에서 한번더 검사한다.

~~~ java
private void considerStoppingAConsumer(BlockingQueueConsumer consumer) {
    Object var2 = this.consumersMonitor;
    synchronized(this.consumersMonitor) {
        if (this.consumers != null && this.consumers.size() > this.concurrentConsumers) {
            long now = System.currentTimeMillis();
            if (this.lastConsumerStopped + this.stopConsumerMinInterval < now) {
                consumer.basicCancel(true);
                this.consumers.remove(consumer);
                if (this.logger.isDebugEnabled()) {
                    this.logger.debug("Idle consumer terminating: " + consumer);
                }

                this.lastConsumerStopped = now;
            }
        }

    }
}
~~~

마지막으로 중지된 Conusmer 이후에 일정 시간이상 동안 계속해서 **betchSize(prefetchCount)** 만큼 처리 하지 않았다면 `Consumer`의 `basicCancel`를 통해 `Channel`을 종료 시키고, 이떄 무한으로 실행되던 `mainLoop`도 종료되며 `Thread`가 종료된다. 그리고 **Consumer를 제거**한다. 
> 참고로 lastConsumerStopped 역시 volatile로 설정되어 있기 때문에 모든 Consumer Thread와 최신 상태 값으로 공유된다. 전체 Conumser와 상태를 공유 하기 위함.

그리고 소스를 보면 알겠지만, Consumer가 제거되는 경우는 현재 `Consumer size`가 설정된 `concurrentConsumers` 보다 클 경우에만 동작한다. (Consumer가 추가적으로 생성된 경우에만 동작한다.)

사실 **betchSize(prefetchCount) 만큼 처리 하지 못했다는 건**, **Queue에 Message가 많지 않다는 것**이다. 그래서 최소 Consumer Size인 **concurrentConsumers 수 보다 더 많이 생성된 Consumer들은 잉여자원**이다.

***정리하면, Conusmer는 설정된 consecutiveIdleTrigger값 이상으로 연이어서 batchSize(prefetchCount) 만큼 처리하지 않았고 이 상태가 lastConsumerStopped 기준으로 stopConsumerMinInterval 이상 동안 유지 됬다면 Consumer가 1개씩 제거 된다. (단, 현재 Consumer Size가 concurrentConsumers보다 클 경우)***