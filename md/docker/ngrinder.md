# Docker로 nGrinder 구축하기
스트레스 도구로 많이 사용하는 ngrinder를 Docker로 쉽게(?) 구현이 가능하다.
단, 개인적으로 ngrinder를 사용하는 것도 좋지만, 분산 테스트나 파괴적인 부하 테스트가 아닌 단순 스트레스 테스트 도구로는 여러가지 훨씬 더 가볍고 간단한 것들이 있으므로 우선 그것들 먼저 추천한다.

<br>
## 간단한 구조
nGrinder는 3부분으로 나눌 수 있다.
* Controller
* Agent
* Target Server

간단하게 표현하면 아래와 같다.
~~~
                             ┌──────┐
                             |Contoller|
                             └──────┘
                  ┌──────────┼──────────┐
              ┌─────┐     ┌─────┐       ┌─────┐
              | Agent  |     | Agent  |       | Agent  |   ...
              └─────┘     └─────┘       └─────┘
                  |               |               |
                (요청)           (요청)            (요청)
                  |               |               |
                  └──────────┼──────────┘
                       ┌─────────────┐
                       |   Target Server   |    ...
                       └─────────────┘

~~~

### Controller
테스팅을 위한 관리자 `웹 인터페이스`를 제공을 하며 Agent 서버들을 관리 한다. 그리고 `테스트 스크립트`와 `테스트`들을 체계적으로 관리하는 서버다.

### Agent
실제적으로 테스트를 수행하는 서버이다. Controller에 작성된 `테스트 스크립트`는 Agent로 전송이 되며, Agent에서 전송받은 `테스트 스크립트`를 실행하여 각 `Target Server`로 테스트 요청을 보내게 된다.  Agent 서버는 여러대일 경우도 있는데, 다른 환경의 분산 테스트를 할 경우나 많은 파괴적인 부하까지의 테스트를 할 경우에 여러대를 사용한다.

### Target Server
구현한 서버로 테스트할 서버 또는 테스트 대상 서버


<br>
##  Scenario
1. Docker에서 ngrinder/contoller, ngrinder/agent 이미지를 받는다.
2. 설정 및 실행
3. 스크립트 작성 및 테스트

> Docker의 기본적인 사용법은 안다는 전제하

### Contoller 설치
`docker pull ngrinder/contoller:3.3` 를 통해서 `controller` 이미지를 받는다.
보면 알겠지만, `3.3` 버전을 사용한다. 참고로 `3.3` 버전부터는 `agent`를 설치후 `controller`에 연결시 자동으로 `agent`서버가 `controller`에 등록이 된다.
이제 `controller 컨테이너`를 생성한다. 명령어를 입력하기 전에 `root` 위치에 `.ngrinder` 디렉토리를 생성해둔다.

다음 명령어로 컨테이너를 생성 및 실행한다.
~~~
docker run -d -v ~/.ngrinder:/root/.ngrinder -p 9090:80 -p 16001:16001 -p 12000-12009:12000-12009 --name=controller ngrinder/controller:3.3
~~~
명령어가 조금 긴 이유는 포트 설정 때문이다.
~~~
에이전트:모든 포트 ==> 컨트롤러 : 16001
에이전트:모든 포트 ==> 컨트롤러 : 12000 ~ 12000 + 동시 테스트 허용할 테스트 개수
컨트롤러:모든 포트 ==> 모니터:13243
컨트롤러 ==> 일반 유저 : 웹 서버 설정 방식에 따르나, 디폴트는 8080 입니다.
(* ==> 는 단방향 포트)
~~~
`16001` 포트는 `controller`와 `agent`간의 메시지를 주고 받기 위한 포트이다. `agent` 서버가 테스트 가능한 상태 인지, `controller`가 현재 테스트가 어떤 상황들이고, 어느 포트에 접속해서 테스트를 준비하라는 명령을 하기 위한 채널이다.


`1200X` 포트는 `controller`가 `agent`에게 테스트를 실행하라, 종료하라는 명령어를 내리고, 테스트 실행 통계를 초별로 수집하는 포트이다.

그리고 웹 인터페이스 접속하기 위한 포트로 `9090`을 지정 했고, 백그라운드에서 실행하기 위해서 `-d` 옵션을 주었다.

실행 후 브라우저에서 `호스트IP:9090` 으로 접속해보면 ngrinder 관리자 페이지가 뜨면 성공적으로 `controller` 서버는 설치가 된것이다.
초기 관리자 계정은 `admin` / `admin` 으로 접속하면 된다.

### Agent 설치
`docker pull ngrinder/agent:3.3` 를 통해서 `agent` 이미지를 받는다.
컨테이너를 실행하기전에 알아야할 사항이 있다.
`controller`와 `agent` 서버들은 각 다른 별도의 서버구조이고, 서로 통신을 해야한다. 때문에 하나의 호스트위에서 둘다 사용하기에는 포트 사용에 제약이 있다.
이를 해결하기 위한 방법으로 여러가지가 있는데,
1. controller가 설치된 host 환경 외 별도의 다른 호스트 환경을 하나 더 생성해서 docker 설치후 agent를 설치, 즉 각 다른 서버 환경으로 만드는 방법
2. docker 내에서 controller와 agent가 같은 네트워크 영역을 사용하게 하는 방법
3. ... 등등

간단한 방법으로 2번을 선택했다. docker에서 기존에 존재하는 다른 컨테이너의 네트워크 환경을 공유하게 하는 `--net=container:<컨테이너ID>` 옵션을 추가하면 된다.
> 컨테이너ID는 현재 실행중인 컨테이너 목록을 출력해주는 `docker ps` 또는 모두 출력하는 `docker ps -a`를 통해서 확인할 수 있다.


그래서 agent 컨테이너를 생성해서 실행할때 controller 컨테이너와 같은 네트워크 영역을 사용하게하여 같은 환경에서 실행되는 효과를 볼 수 있다.

~~~
docker run -it -e 'CONTROLLER_ADDR=<controller_server_ip>:<controller_web_port>' --net=container:<컨테이너ID> --name=agent ngrinder/agent:3.3 /bin/bash
~~~
> controller_server_ip는 controller 컨테이너 ip인데 확인하는 방법은 `docker exec -it controller /bin/bash`로 접속하여 `ip addr`을 통해 확인
> controller_web_port는 웹 인터페이스에 접속하기 위해 설정한 포트로 위에서는 `9090` 했음
> ex)
> docker run -it -e 'CONTROLLER_ADDR=172.17.0.2:9090' --net=container:43325c9910be  --name=agent2 ngrinder/agent:3.3 /bin/bash

위 명령어를 입력하면 agent 컨테이너가 생성되면서 접속이 된다.
agent를 구축하기 위해서는 한가지가 더 남았는데, controller 관리자 페이지에서 `에이전트 관리탭`을 누르면 `다운로드: /agent/download/ngrinder-agent-3.3.tar`를 볼 수 있는데, 이 tar 파일을 다운 받아서 실행만 하면 자동으로 컨트롤러와 연결 및 승인처리가 된다.

현재 agent 컨테이너에 접속한 상테에서 `/home` 디렉토리로 이동해서
~~~
wget <host ip>:<controller_web_port>//agent/download/ngrinder-agent-3.3.tar
~~~
명령어로 agent 파일을 다운 받는다. 그리고
~~~
tar xvf ngrinder-agent-3.3.tar
~~~
명령어로 압축을 풀고 `./run_agent.sh` 실행을 한다.
> 백그라운드에서 실행을 하고 싶다면 ./run_agent_bg.sh를 실행

그리고 나서 오류가 없다면 controller 관리자 페이지의 `에이전트 관리탭`에서 agent가 연결된 것을 확인 할 수 있다.
그리고 나서 간단한 스크립트를 작성 후 성능 테스트를 시작 하면 된다.
