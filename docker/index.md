## Docker
Docker는 컨테이너라는 독립된(또 셋팅된) 환경을 만들어주기 때문에 쉽게 날리고, 생성이 가능하다.
자세한 설명은 일단 [공식홈페이지](https://docs.docker.com/engine/userguide/intro/)...

<br>
### 설치
Docker를 이용하기 위해서는 Centos7 64비트 버전이 필요하다.

~~~
yum -y install docker
~~~

<br>
### 자동 스크립트 설치
Docker는 리눅스 배포판 종류를 자동으로 인식하여 패키지를 설치해주는 스크립트를 제공합니다.

wget -qO- https://get.docker.com/ | sh

<br>
### 이미지 검색
~~~
docker search [이미지명]
~~~
Ddocker 이미지는 search 커맨드를 통해 내려 받을 수 있다. 그리고 Docker는 [DockerHub](https://hub.docker.com/) 저장소를 사용 하기 때문에 [DockerHub](https://hub.docker.com/)에서 검색 및 이미지 Description을 확인 할 수 있다.

> ex: docker search nginx


<br>
### 이미지 다운로드
~~~
docker pull [옵션] <이미지명>[:태그명]
~~~
해당 이미지를 검색 후 다운 받을 수 있다. 공식 이미지는 OFFICIAL에 \[OK\] 표시가 되어 있다.
> ex: docker pull centos:latest


<br>
### 이미지 목록 출력
~~~
docker images [옵션][repository명]
~~~
다운로드한 이미지 목록을 images 커맨드로 출력 할 수 있다.
docker images 커맨드만 입력 해도 모든 이미지를 출력 가능 하다.

또한 Docker Repository에 업로드 된 이미지는 식별 가능한 digest가 부여 된다.
~~~
docker images --digests [repository명]
~~~

<br>
### 이미지 삭제
~~~
docker rmi [옵션] <이미지명>
~~~

> ex: docker rmi nginx

<br>
### 컨테이너 생성 및 구동
~~~
docker run [옵션] <이미지명>[:태그명] [값]
~~~

> ex: docker run -it --name=centos centos /bin/bash

### 컨테이너 삭제
~~~
docker rm [옵션] <컨테이너명 또는 ID>
~~~

### 컨테이너 시작

### 컨테이너 재시작

### export vs Save

### 레이어, 이전 레이어로 돌아가기
