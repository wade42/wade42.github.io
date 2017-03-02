
## 설치 - systemjs
systemjs를 이용하는 방법은 [QuickStart](https://github.com/angular/quickstart/blob/master/package.json)의 설치 방법 이다. 약간의 라이브러리 버전들이 올라가면서 방법이 조금 달라 졌다.

일단 설치 방법에는 2가지가 있다.
1. QuickStart 클론
2. angular-cli
3. <b>express (또는 다른 웹서버) + Angular2</b>

QuickStart 클론을 하여 `devDependencies`까지 설치할 경우, `lite-server`가 같이 설치 되기 때문에 별도의 웹서버는 필요 하지 않다.
하지만, 다양한 서비스 및 연동을 위해서 별도 웹서버와 연동 하는 방법을 소개 하려 한다.

지금 부터 설명할 방법은, <b>3. express + Angaulr2</b> 이다. 다음과 같은 것들이 필요하다.

* node && npm
* atom editor && atom-typescript package
* express


#### express 설치
~~~
npm init
npm install express --save
~~~

static , file ....
...
..
...
...
..


Angaulr2 [QuickStart의 package.json](https://github.com/angular/quickstart/blob/master/package.json)의 dependencies만 복사 해서 npm init 으로 생성한 package.json 에 붙여 넣는다.

npm install
