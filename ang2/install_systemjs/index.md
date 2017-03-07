
# 설치 - systemjs
systemjs를 이용하는 방법은 [QuickStart](https://github.com/angular/quickstart/blob/master/package.json)의 설치 방법 이다. 약간의 라이브러리 버전들이 올라가면서 방법이 조금 달라 졌다.

일단 사용방법으로 3가지가 있다.
1. QuickStart 클론
2. angular-cli
3. <b>express (또는 다른 웹서버) + Angular2</b>

QuickStart 클론을 하여 `devDependencies`까지 설치할 경우, `lite-server`가 같이 설치 되기 때문에 별도의 웹서버는 필요 하지 않다.


여기서 설명 하는 방법은, <b>3. express + Angaulr2</b>.
그리고  다음과 같은 것들이 필요하다.

* node & npm
* atom editor & atom-typescript package
* express

##  Scenario

1. node 설치 (생략, 압축 파일 추천)
2. atom에 atom-typescript 설치 (생략)
3. express 패키지 로컬에 생성
4. app.js 생성 후 서버 셋팅 로직 작성
5. javascript 리소스 폴더에 angular2 프로젝트 생성
6. angular2 설정
7. 테스트

## Getting start
#### express 프로젝트 생성 및 설정
아무 프로젝트 이름의 폴더를 하나 생성 해서 그 안에서 npm을 이용하여 express 패키지를 생성한다.
~~~
npm init                        # package.json 생성
npm install express --save      # 로컬에 express 패키지 생성
~~~
프로젝트 폴더에 node_modules라는 폴더로 express 패키지들이 생성이 되면 프로젝트 폴더 안에 app.js 파일,view, public, public에 js, css 폴더를 생성한다.

~~~
test_project/
├── node_modules/           # express 패키지
├── public/                 # static 파일
│   ├── js/
│   └── css/
├── view/
├── app.js
└── package.json
~~~

app.js 파일은 express 서버의 메인 파일로, 서버설정 코드를 입력한다.

~~~
// app.js

var express = require('express');
var path = require('path');
var app = express();

app.use('/static', express.static(path.join(__dirname , '/public')));

app.get('/', function (req, res) {
  res.send('Hello World!');
});

app.listen(80, function () {
  console.log('Example app listening on port 80!');
});
~~~

> express의 자세한 설명은 [공식홈페이](http://expressjs.com/)에서 확인

node를 통해서 실행 되는지 확인한다.
~~~
node app.js
~~~

실행 해보고 브라우저로 잘 동작 하는 지 확인 한다.

<br>
#### Angular2 생성 및 설정
프로젝트 폴더의 public/js/ 폴더 안에 Angular2 프레임워크를 `npm`을 이용하여 생성한다.

~~~
npm init           # package.json 생성
~~~
생성된 package.json에 Angular2에 필요한 모듈들을 작성해야 한다.
Angaulr2 [QuickStart의 package.json](https://github.com/angular/quickstart/blob/master/package.json)의 `dependencies`만 복사 해서 붙여 넣고 install 한다.

~~~
npm install
~~~

설치가 완료 되면 js 폴더 안에 node_modules 폴더가 생성되고 안에 Angular2 프레임워크가 생성된다.

~~~
test_project/
├── node_modules/           # express 패키지
├── public/                 # static 파일
│   ├── js/
│   │   ├── node_modules/   # angular2 패키지
│   │   └── pacakge.json
│   └── css/
├── view/
├── app.js
└── package.json
~~~

angular2는 `typescript`로 작성되 있고, 사용하기 위해서는 typescript로 작성해야 한다. 그리고 모듈 로더인 `systemjs`를 사용하여 javascript 모듈을 로드한다.
typescript를 사용하기 위해서는 typescript의 컴파일 옵션을 지정하는 `tsconfig.json` 파일이 필요하다. 그리고 `tsconfig.json` 파일이 위치한 곳이 프로젝트의 루트이다.

QuickStart의 [tsconfig.json](https://github.com/angular/quickstart/blob/master/src/tsconfig.json) 과 [system.config.js](https://github.com/angular/quickstart/blob/master/src/systemjs.config.js)를 angular2의 패키지와 같은 위치에 복사한다.

~~~
test_project/
├── node_modules/           # express 패키지
├── public/                 # static 파일
│   ├── js/
│   │   ├── node_modules/   # angular2 패키지
│   │   ├── package.json    
│   │   ├── systemjs.config.js  # systemjs 설정 파일
│   │   └── tsconfig.json       # typescript 컴파일 설정 파일
│   └── css/
├── view/
├── app.js
└── package.json
~~~

타입스크립트를 컴파일 하는 방법에는 두가지가 있다.
* `Atom Editor`의 `atom-typescript` 플러그인 설치하여 컴파일
* 노드에 타입스크립트를 설치하여 컴파일

`Atom`에 `atom-typescript`를 설치 하면 자동으로 `tsconfig.json`을 찾아서 설정된 옵션대로 .ts 파일을 저장 할때마다 자동으로 컴파일 하여 js 파일을 생성 해 준다. 때문에 개인적으로 `Atom`을 추천한다.

마지막으로 systemjs의 path 설정만 변경해주면 된다.
~~~
// system.config.js
// 변경전
paths: {
  // paths serve as alias
  'npm:': '/node_modules/'
},
map: {
  // our app is within the app folder
  app: 'app',
...

// 변경후
paths: {
  // paths serve as alias
  'npm:': '/static/js/node_modules/'
},
// map tells the System loader where to look for things
map: {
  // our app is within the app folder
  app: '/static/js/app',
...
~~~
express 에서 설정한 static한 path만 붙여주면 된다.

> Angular2의 패키지가 저장된 node_modules 폴더명은 변경을 추천

<br>
#### 테스트

QuickStart의 [index.html](https://github.com/angular/quickstart/blob/master/src/index.html) 템프릿은 `view` 폴더에 복사하고 리소스 Path만 express 에서 설정한 static 주소로 변경 해준다.

~~~
// index.html
// 변경전
<script src="node_modules/.....

// 변경후
<script src="/static/js/node_modules/.....
~~~

 [main.ts](https://github.com/angular/quickstart/blob/master/src/main.ts)는 `/public/js` 폴더에, 그리고 `App` 폴더를 생성해서 `/publicjs/app` 폴더에는 [app.module.ts](https://github.com/angular/quickstart/blob/master/src/app/app.module.ts), [app.component.ts](https://github.com/angular/quickstart/blob/master/src/app/app.component.ts)를 복사한다.

 ~~~
 test_project/
 ├── node_modules/           # express 패키지
 ├── public/                 # static 파일
 │   ├── js/
 │   │   ├── node_modules/   # angular2 패키지
 │   │   ├── app/
 │   │   │   ├── app.component.ts   # 컴포넌트 파일
 │   │   │   └── app.module.ts      # 모듈 파일
 │   │   ├── main.ts        # angular2 main 파일
 │   │   ├── package.json    
 │   │   ├── systemjs.config.js  # systemjs 설정 파일
 │   │   └── tsconfig.json       # typescript 컴파일 설정 파일
 │   └── css/
 ├── view/
 │   └── index.html         # 템플릿 파일
 ├── app.js
 └── package.json
 ~~~

마지막으로, express의 `app.js`에 Request URL 을 추가한다.
~~~
app.get('/ang', function(req, res){
    res.sendFile(path.join(__dirname, "/view/", "index.html"));
});
~~~
이제 브라우저에서 `http://localhost/ang` 로 접속해 본다.

<b>끗.</b>
