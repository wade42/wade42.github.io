# 불변 데이터 - Angular & React

## 불변 데이터
불변 데이터는 원래 함수형 프로그래밍의 핵심 개념이다. 객체 지향 프로그래밍에 있어서 불변객체(immutable object)는 생성 후 그 상태를 바꿀 수 없는 객체를 말한다.
~~~
const a = 1;        // a 선언
a = 2;              // a 변경시도시 변경되지 않거나 오류를 발생

const b = "immutable";      // b 선언
b = "mutable";              // b 역시 변경되지 않거나 오류를 발생
~~~
위와 같이 const 변수에 원시 데이터 타입으로 선언 하였을 경우 변경할 수 없다. 하지만 const 변수에 객체를 선언하였을 경우에는 얘기가 달라진다.
~~~
const data = { a: 1, b: "mutable" }     // data 선언
data.a = 2;         // 변경 성공
~~~
원시 데이터 타입으로 선언 했을 경우에는 변수에 값이 할당 되지만, 변수에 객체를 선언 했을 경우에는 객체의 참조값이 변수에 복사되기 때문에 변경될 수 있다. 즉, 객체의 값은 변할지라도 객체의 참조값은 변하지 않기 때문에 변경되지 않았다고 판단할 수 있다.
> [MDN의 const](https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Statements/const)

이는 문제가 된다. 외부 어떤 다른 곳에서 객체가 수정될 가능성이 있기 때문이다.
불변 데이터라고 하기 위해서는 같은 객체의 복사본을 만들어 사용해야 한다.

~~~
const list = [1, 2, 3];
console.log(list === list.reverse());   // true
console.log(list === list.slice().reverse()) // false
// slice() 메소드는 어떤 배열의 일부에 대한 얇은 복사본 배열을 반환
~~~


## Angular2 & React
Angaulr와 React도 불변 데이터 구조를 이용한다.

### Angular2 Change Detection
Angular2에서는 컴포넌트들은 `트리`로 관리 된다. 그리고 컨포넌트들은 `변경감지(Change Detection)`를 통해서 컴포넌트의 프로퍼티가 변경되면 감지하여 DOM을 변경한다. 참고로 Angular2에서 각 컴포넌트에 자체 `변경 검출기(Change Detector)`가 있다. 그리고 `변경감지(Change Detection)`는 컴포넌트가 `트리`로 관리 되기 때문에 언제나 루트 컴포넌트 부터 위에서 아래로 `변경감지(Change Detection)`를 실행하게 된다.

Angular2에서는 컴포넌트에서 다른 컴포넌포넌트로 정보를 주거나 받아서 처리가 가능하다. 그것이 `@Input` 데코레이터를 컴포넌트 프로퍼티 앞에 설정한다.
~~~
@Component{
    ...
}
export class SubComponent{
    @Input() content: string;   // content is input properties
}
~~~

`@Input` 이 설정된 프로퍼티를 여기서는 `입력 프로퍼티`라고 하겠다. 그래서 상위 컴포넌트에서 특정 이벤트에 의해서 하위 컴포넌트로 데이터를 받아서 반영이 가능하다.

그런데 만약 A 컴포넌트의 `입력 프로퍼티`가 불변하지 않다면(가변이라면) 다른 어떤 컴포넌트 또는 서비스에서 객체의 참조하여 변경이 일어 났을 경우, A 컴포넌트의 `입력 프로퍼티`는 변경되지만, 변화가 일어 났는지는 A 컴포넌트의 변경 검출기가 알아 차리지 못한다. 객체의 값이 변한 것이지, 참조가 변하지 않았기 때문. 그리고 컴포넌트 트리 내에서 어떤 객체에 관해 누가 알고 있는지 누가 변경했는지 추적할 수 없다. 이렇게되면 전체 트리에 대해서 루트 컴포넌트 부터 `변경감지(Change Detection)`를 해야할 것이다.

 만약 컴포넌트의 `입력 프로퍼티`가 불변하다는 것만 보장한다면 훨씬 효율적으로 변한다. 컴포넌트의 `입력 프로퍼티`가 불변이라면(`입력 프로퍼티`의 값을 수정할 수 없다면) 컴포넌트가 변경감지(Change Detection)를 하는 유일한 경우로는 새로운 객체가 새로 생성되서 `입력 프로퍼티`(참조 값)을 변경하는 것 밖에 없다. 그렇기 때문에 간단한 참조 비교로 변화를 감지 할 수 있게 된다. 그리고 참조 값이 변화하기 전까지는 `입력 프로퍼티` 그 자체가 변하지 않을 거라고 약속하고, 컴포넌트와 그 외 서브 컴포넌트에서 변경되지 않은 값에 대해서는 `변경 감지(Change Detection)`을 시행하지 않아도 된다. 때문에 트리가 아주 효율적으로 되고, 변경검출(Change Detection)을 최적화 할 수 있다. 그래서 성능 면에서 이점이 있다.

컴포넌트 데코레이터의 `changeDetection` 프로퍼티를 메타데이터로 지정함으로써 `변경감지(Change Detection)`의 전략을 설정할 수 있다.

 * ChangeDetectionStrategy.Default
    모든 가능한 에플리케이션 상태 변화에 대해 변경 점검을 확실히 하는 전략이다. 성능에 가장 부담을 주는 전략이며 기본값이다.
 * ChangeDetectionStrategy.OnPush
   불변 데이터가 변경됐을 때만 컴포넌트를 점검하라고 Angular에게 변경하라 지시한다.

다음과 같이 사용하면 된다.
~~~
@Component({
  selector: 'my-app',
  templateUrl: ...,
  styleUrls: ...,
  changeDetection: ChangeDetectionStrategy.OnPush,

})
export class AppComponent{
    @Input() content: string;
    ...
}
~~~

하지만 Observable이나 Promise 처럼 비동기에서 `입력 프로퍼티`를 변경하였을 경우에는 OnPush 옵션은 적용되지 않는다. 이때 사용하는 방법이 `ChangeDetectorRef`이다.
`ChangeDetectorRef`에는 `markForCheck()` 메소드가 있다. 이 메소드는 호출시점에 `변경감지(Change Detection)`를 수행해 달라고 수동으로 마킹 시킨다.
그래서 `ChangeDetectorRef`를 inject 시킨 후 `입력 프로퍼티`를 변경한 로직 직후에 실행 시키면 된다.

~~~
observable.subscribe(
    data => {

        this.content = this.md.marked(data._body);
        this.ref.markForCheck();    // changed detection run!
    },
    error => console.error(error)
);
~~~


### React setUpdate
... 작성중
