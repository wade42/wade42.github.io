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


</br>

## Angular2 & React
데이터의 변화를 빠르게 감지해서 DOM에 반영하기위해 Angaulr와 React도 불변 데이터 구조를 이용한다.

</br>

## Angular2 - Change Detection
Angular2에서 컨포넌트는 `변경감지(Change Detection)`를 통해서 컴포넌트 프로퍼티의 변경을 감지하고 DOM에 반영을 한다. 그리고 컴포넌트들은 `트리`로 관리 된다. 때문에 `변경감지(Change Detection)`는 루트 컴포넌트 부터 위에서 아래로 실행된다.

Angular2에서는 `@Input` 데코레이터 설정을 통해서 컴포넌트에서 다른 컴포넌트로 정보를 주거나 또는 받아서 처리가 가능하다. 한가지 예를 들면 상위 컴포넌트에서 특정 이벤트에 의해서 하위 컴포넌트로 데이터를 받아서 뷰에 반영하는 일이다.

사용하기 위해서는 데이터를 받는 컴포넌트의 프로퍼티 앞에 `@Input`을 설정해주면 된다.
`@Input` 이 설정된 프로퍼티를 여기서는 `입력 프로퍼티`라고 하겠다.
~~~
@Component{
    ...
}
export class SubComponent{
    @Input() content: string;   // content is input properties
}
~~~

#### 가변 vs 불변
A 컴포넌트의 `입력 프로퍼티`가 불변하지 않을 때(가변이라면) 다른 어떤 컴포넌트 또는 서비스에서 A 컴포넌트의 `입력 프로퍼티`를 참조하여 값을 변경하였을 경우, 실제 A 컴포넌트의 `입력 프로퍼티`는 변경되지만 변화가 일어 났는지는 알아 차리지 못한다. 객체의 값이 변한 것이지, 참조가 변하지 않았기 때문. 이렇게 되면 컴포넌트 트리 내에서 누가 `입력 프로퍼티`에 대해서 알고 있는지, 누가 변경했는지 추적할 수 없다. 결국 전체 트리에 대해서 루트 컴포넌트 부터 다시 `변경감지(Change Detection)`를 모두 해야할 것이다.

만약 컴포넌트의 `입력 프로퍼티`가 불변하다는 것만 보장한다면 훨씬 효율적으로 변한다. 컴포넌트의 `입력 프로퍼티`가 불변이라면(`입력 프로퍼티`의 값을 수정할 수 없다면) 변경할 수 있는 유일한 방법으로는 참조 값을 바꾸는 것이다. 즉, 객체 자체를 새로 생성해서 바꾸는 일이다. 이렇게 되면 간단하게 참조 값만으로 `변경 감지(Change Detection`을 할 수 있게되며 변경되지 않은 컴포넌트들에 대해서는 생략하고 영향을 주는 컴포넌트 들에게만 `변경 감지(Change Detection)`를 실행하라고 할 수 있다. 그래서 `입력 프로퍼티`가 불변일 경우에 `변경 감지(Change Detection)` 전략에 대해 효율적으로 최적화 할 수 있다.

참고로 Angular2에서 각 컴포넌트에는 자체 `변경 검출기(Change Detector)`가 있다. </br>
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
`ChangeDetectorRef`에는 `markForCheck()` 메소드가 있다. 이 메소드는 호출시점에 `변경 감지(Change Detection)`를 수행해서 변화가 있다면 DOM에 반영해 달라고 수동으로 마킹 시킨다.
그래서 `ChangeDetectorRef`를 inject 시킨 후 `입력 프로퍼티`를 변경하는 로직 직후에 실행 시킨다.

~~~
observable.subscribe(
    data => {

        this.content = this.md.marked(data._body);
        this.ref.markForCheck();    // changed detection run!
    },
    error => console.error(error)
);
~~~

</br>

## React - setUpdate
React에서 화며을 업데이트 하는 과정을 살펴 보면 Angular와 흡사하다. 과정을 살펴보면 </br>
먼저 리엑트 컴포넌트의 프로퍼티를 변경을 하고 `setState` 메소드를 통해 state가 바뀌면 다음 메소드 들을 차례로 실행 한다.

~~~
shouldComponentUpdate -> componentWillUpdate-> render -> componentDidUpdate
~~~

참고로 `shouldComponentUpdate` 메소드에는 컴포넌트의 프로퍼티가 변경 되었는지 비교하는 로직이 들어가며, 그 결과에 따라 Virtual DOM과 실제 DOM을 비교하여 DOM을 다시 그릴지 판단하게 된다. 즉 `false`를 리턴 하면 화면을 다시 그리지 않게 된다. 주의할 점은, 컴포넌트에서 `shouldComponentUpdate` 메소드를 구현하지 않으면 기본값으로 true를 리턴하기 때문에 매번 화면을 다시 그리게 된다. 이는 성능 상에 이슈가 생길 여지가 있다. 때문에 성능 이슈가 생길만한 컴포넌트는 `shouldComponentUpdate`를 구현해주는 것을 추천한다.

#### 가변 vs 불변
React Document 문서를 보면 `shouldComponentUpdate`는 두개의 파라미터를 받는다.
~~~
shouldComponentUpdate(nextProps, nextState)
~~~
그래서 현재 props, state에 있는 객체와 전달 받은 nextProps, nextState으로 저달된 객체와 비교하여 DOM을 다시 그릴지 판단하게 되는 것이다. </br>

만약 props로 전달된 객체들이 가변이라면, 단순 참조 비교문으로는 객체의 값이 변했는지 알 수가 없다. 이유는 역시 값이 변한 것이지 참조값은 변한것이 아니기 때문. 이렇게 되면 컴포넌트는 어디서 변경되었는지 추적하기 어려워 진다. 그리고 변경을 판단하기 위해서 객체에 있는 모든 값들에 대해서 비교문을 작성해야 하고, 행여 객체에 프로퍼티나 상태가 많아지면 비교로직이 점점 복잡해 질것이다.
</br>

반대로 불변이라면, 객체와 상태가 변하지 않는한 DOM은 변경되지 않는 다는 것을 보장할 수 있고, 단순 참조 비교문으로 객체와, 상태가 변경되었는지 알 수 있게 된다.


</br>

## 불변 객체와 성능
매번 객체를 clone으로 복사하는 것으로 생각하는데 사실은 그것이 아니다. 내부 데이터를 복제 하지 않고 값을 변경한 체로 새로 다시 연결될 참조값만 복사하여 리턴 한다. </br>
예를들면, 연결 리스트(Linked List)를 들 수 있다.




</br>
</br>
</br>

> #### 참고
> [Angular2 Docs](https://angular.io/docs/ts/latest/)</br>
> [ANGULAR CHANGE DETECTION EXPLAINED](https://blog.thoughtram.io/angular/2016/02/22/angular-2-change-detection-explained.html)</br>
> [React Docs](https://facebook.github.io/react/docs/react-component.html)</br>
> [React State가 불변이어야 하는 이유](https://medium.com/@ljs0705/react-state%EA%B0%80-%EB%B6%88%EB%B3%80%EC%9D%B4%EC%96%B4%EC%95%BC-%ED%95%98%EB%8A%94-%EC%9D%B4%EC%9C%A0-ec2bf09c1021)</br>
> [리덕스 패턴과 안티 패턴](https://www.vobour.com/book/view/TGJKKFN2TmyxaGDpN)</br>
> [REACT 컴포넌트 생명주기](http://blog.coderifleman.com/2015/08/16/react-and-immutable/)</br>
