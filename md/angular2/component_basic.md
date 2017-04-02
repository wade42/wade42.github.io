# 컴포넌트 - 기본

의미적으로 영역을 구분하는 시맨틱 영역, 또는 블락이 곧 컴포넌트이다.
외부 의존성 없이 독립적으로 동작이 가능하다.
부모, 자식 컴포넌트의 관계, 즉 계층성을 줄 수 있다.
계층적 구조에서는 의존성이 존재할 수 있다.

컴포넌트 설계시 참고할 점은 컴포넌트의 이름이 의미하는 대로 예상된 일만 하는지 항상 확인 하라는 점이다.
즉, SRP(Single-Responsibility Principle)을 따르 라는 것이다.

## 기본구조
~~~
import { Component } from ‘@angular/core’;

@Component({
	// 메타 데이터
})
export class AppComponent{
	// 컴포넌트 로직
}
~~~
## 데코레이터

컴포넌트의 메타 데이터를 작성 하는 @Component는 데코레이터이라고 부른다.
사실 현재 ECMAScript 6  스팩에는 들어 있지 않지만, ECMAScript 7에는 표준으로 제안 됐다. 그래서 데코레이터는 클래스와 클래스 프로퍼티를 어노테이션 하는 데 사용 된다.
Next ECMAscript의 [표준 제안](https://github.com/tc39/proposals) 에서 확인 할 수 있다.
주의 할점은 타입스크립트의 데코레이터와는 약간 다르다는 것이다.
타입스크립트의 데코레이터는 클래스 메소드 내에 매개변수로도 둘 수 있다.

Angular2의 공식 홈페이지의 가이드 기준으로
~~~
@Component({
	selector: ‘hello’,
	template: `<div> Hello </div>`,
	styles: [`div{ background: blue; }`]
})
~~~
select 속성은 커스텀 엘리먼트의 이름과 매칭 시키면 된다.
template 속성에는 UI 코드가 작성 되는데 직접 코드를 작성해 넣어도 되고 HTML 파일을 불러 올 수 있다.
외부 HTML 파일을 불러올 경우에는 templateURL 속성을 사용한다.
styles 속성에는 템플릿의 css 스타일을 직접 입력하여 설정 할 수 있고, 또는 styleUrls 속성을 이용하여 외부에 있는 css 파일을 불러 올 수 있다.


## 클래스

컴포넌트 클래스에는 뷰와 바인딩될 데이터 및 이벤트 처리와 관련된 로직이들어 간다.

~~~
@Component({
	selector: 'my-app',
  	template: `<h1>Hello {{name}}</h1>`,
})
export class AppComponent  {
	name = 'Angular';
}
~~~

중괄호 2개인 `{{ .. }}` 안에 AppComponent 클래스의 맴버변수를 사용하면 뷰에 반영이 된다.


## 계층 구조
컴포넌트를 사용하기 위해서는 반드시 모듈에 등록을 해야 한다.
하지만 계층적 구조로 자식 컴포넌트 들을 사용 하는 방법에는 2가지가 있다.
1. 모듈에 모두 선언
2. 컴포넌트안에 `directives`로 자식 컴포넌트 선언
