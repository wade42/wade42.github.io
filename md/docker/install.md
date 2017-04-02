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
참고로, 공식 이미지는 OFFICIAL에 \[OK\] 표시가 되어 있다.
> ex: docker search nginx


<br>
### 이미지 다운로드
~~~
docker pull [옵션] <이미지명>[:태그명]
~~~
해당 이미지 다운받는다.
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
이미지를 삭제한다.

> ex: docker rmi nginx

### 이미지 세부 정보 확인
~~~
docker inspect [옵션] <이미지명 또는 ID>
~~~
이미지 세부 정보를 확인 한다.
세부 정보가 표시되는데 주요한 정보는 다음과 같다.
* 이미지 ID
* 생성일
* Docker 버전
* 이미지 생성자
* CPU
* Docker 레이어

> Docker 레이어는  이미지를 commit 할 때마다 새로운 레이어 id가 형성 된다.
> docker tag \<LAYER ID\> \<IMAGE NAME\> 커맨드를 통해서 이전 레이어의 상태로 되돌아 갈 수 있다.
> 단, 레이어가 존재할 경우

<br>
또 `--format` 옵션을 통해 특정 상세 정보면 추출 할 수 있다.

{
    ...
    "Os": "ubuntu",
    ...
}
~~~
docker inspect --format="{{ .Os}}" nginx
~~~
Os 값은 상세 정보 객체의 루트 밑의 Os에 있으므로 {{ .Os}}로 지정 한다.


<br>
### 컨테이너 생성 및 구동
~~~
docker run [옵션] <이미지명>[:태그명] [값]
~~~
컨테이너를 실행 하면서 생성한다.

##### 주요 옵션 기호
|옵션|설명|
|:--|:--|
| -a, --attach=[STDIN or STDOUT or STDERR] | 표준 입력(STDIN), 표준 출력(STDOUT), 표준 에러 출력(STDERR)을 연결 |
| --cidfile="파일명" | 컨테이너 ID를 파일로 출력 |
| -d, --detach=false | 컨테이너를 생성하여 백그라운드에서 실행 |
| -i, --interactive=false | 컨테이너ㅓ 표준 입력 열기 |
| -t, --tty=false |  tty(단말 디바이스)를 사용) |
| --name | 컨테이너명 |

간단한 예를 들면
~~~
docker run -it --name=devServer centos /bin/bash
  #1        #2       #3         #4      #5
~~~
아마, 가장 많이 사용하게 될 명령어 이다. 위 명령어를 실행 하면 `devServer`라는 이름으로 `centos` 이미지의 컨테이너가 생성 되면서 컨테이너 표준 입력기를 열어 /bin/bash를 실행한다. (컨테이너 root으로 접속 되어 있을 것임)

컨테이너를 백그라운드를 실행 하기위해서는 -d 옵션을 사용한다.
~~~
docker run -d centos /bin/ping localhost
~~~
컨테이너를 백그라운드에서 실행하게 하면 컨테이너 ID를 리턴 한다.
백그라운드에서 실행되고 있는지의 여부를 확인 하기 위해서는
~~~
docker logs -t <이미지명, ID>
~~~
명령어로 백그라운드에서 실행되고 있는 로그를 ping 커맨드로 확인 가능 하다.
또는
~~~
docker ps
~~~
명령어로 확인한다.

주의 해야할 점은, 컨테이너 bash를 종료 하면 컨테이너는 종료된다. 때문에 컨테이너 bash에서 나올때 ctrl + p, + q 를 통해 빠져 나와야 한다.
또는 restart 옵션을 사용 하면 bash가 종료되어도 컨테이너를 재구동한다.
~~~
docker run -it --restart=always centos /bin/bash
~~~

<br>
... 컨테이너 볼륨 연결
... 컨테이너 네트워크 설정



<br>
### 컨테이너 삭제
~~~
docker rm [옵션] <컨테이너명 또는 ID>
~~~

<br>
### 컨테이너 구동 확인
~~~
docker stats <컨테이너명 또는 ID>
~~~
Docker상에서 동작하는 컨테이너 상태를 확인한다.
실행 결과로, `CPU 사용률`, `메모리사용량`, `컨테이너에서 사용할 수 있는 메모리 제한`, `메모리 사용률`, `네트워크 I/O`를 출력해준다.

<br>
### 컨테이너 시작
~~~
docker start [옵션] <컨테이너명 또는 ID>
~~~
중지되어 있는 컨테이너를 구동

> docker start nginx

<br>
### 컨테이너 재시작
~~~
docker [옵션] restart
~~~
컨테이너를 재시작 한다. `-t` 옵션을 통해 컨테이너 재시작 시간을 지정할 수 있다. (default는 10초)

> docker restart nginx
> docker restart -t 2 nginx
> (2초후 재시작)
