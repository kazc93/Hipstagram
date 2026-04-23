pipeline {
    agent any

    // ── Variables de entorno ─────────────────────────────────────────────────
    environment {
        AWS_REGION      = 'us-east-1'
        AWS_ACCOUNT_ID  = '630171690893'

        ECR_REGISTRY    = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

        // Un repositorio ECR por microservicio
        ECR_REPO_AUTH   = 'hipstagram-auth-service'
        ECR_REPO_POST   = 'hipstagram-post-service'
        ECR_REPO_SEARCH = 'hipstagram-search-service'
        ECR_REPO_ADMIN  = 'hipstagram-admin-service'
        ECR_REPO_GW     = 'hipstagram-gateway'

        IMAGE_TAG       = "${env.BUILD_NUMBER}"

        SONAR_SERVER    = 'SonarQube'
        ENV_FILE        = '/etc/hipstagram.env'
    }

    tools {
        nodejs 'NodeJS-18'
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 45, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    // ── Stages ───────────────────────────────────────────────────────────────
    stages {

        // 1. Checkout
        stage('Checkout') {
            steps {
                checkout scm
                echo "Branch: ${env.GIT_BRANCH}  |  Commit: ${env.GIT_COMMIT}"
            }
        }

        // 2. Instalar dependencias del backend monolítico (para tests y lint)
        stage('Install Dependencies') {
            steps {
                dir('backend') {
                    sh 'npm ci'
                }
            }
        }

        // 3. Lint
        stage('Lint') {
            steps {
                dir('backend') {
                    sh 'npm audit --audit-level=high || true'
                    sh 'npm run lint'
                }
            }
            post {
                failure {
                    echo 'Lint fallido. Revisa los errores de ESLint arriba.'
                }
            }
        }

        // 4. Pruebas unitarias con cobertura
        stage('Unit Tests') {
            steps {
                dir('backend') {
                    sh 'npm run test:ci'
                }
            }
            post {
                always {
                    junit allowEmptyResults: true,
                          testResults: 'backend/junit.xml'
                }
            }
        }

        // 5. Análisis SonarQube
        stage('SonarQube Analysis') {
            steps {
                dir('backend') {
                    withSonarQubeEnv("${SONAR_SERVER}") {
                        sh """
                            npx sonar-scanner \
                              -Dsonar.organization=kazc93 \
                              -Dsonar.projectKey=kazc93_proyecto-hipstagram \
                              -Dsonar.projectName='Hipstagram Backend' \
                              -Dsonar.sources=src \
                              -Dsonar.exclusions='dist/**,node_modules/**,coverage/**,src/**/__tests__/**' \
                              -Dsonar.tests=src/__tests__ \
                              -Dsonar.test.inclusions='**/*.spec.ts,**/*.test.ts' \
                              -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info
                        """
                    }
                }
            }
        }

        // 6. Quality Gate
        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: false
                }
            }
        }

        // 7. Build imágenes Docker de los microservicios
        stage('Build Docker Images') {
            steps {
                sh """
                    docker build -t ${ECR_REGISTRY}/${ECR_REPO_AUTH}:${IMAGE_TAG}   -t ${ECR_REGISTRY}/${ECR_REPO_AUTH}:latest   ./backend/services/auth-service
                    docker build -t ${ECR_REGISTRY}/${ECR_REPO_POST}:${IMAGE_TAG}   -t ${ECR_REGISTRY}/${ECR_REPO_POST}:latest   ./backend/services/post-service
                    docker build -t ${ECR_REGISTRY}/${ECR_REPO_SEARCH}:${IMAGE_TAG} -t ${ECR_REGISTRY}/${ECR_REPO_SEARCH}:latest ./backend/services/search-service
                    docker build -t ${ECR_REGISTRY}/${ECR_REPO_ADMIN}:${IMAGE_TAG}  -t ${ECR_REGISTRY}/${ECR_REPO_ADMIN}:latest  ./backend/services/admin-service
                    docker build -t ${ECR_REGISTRY}/${ECR_REPO_GW}:${IMAGE_TAG}     -t ${ECR_REGISTRY}/${ECR_REPO_GW}:latest     ./gateway
                """
            }
        }

        // 8. Push a AWS ECR
        stage('Push to ECR') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-credentials'
                ]]) {
                    sh """
                        aws ecr get-login-password --region ${AWS_REGION} \
                          | docker login --username AWS --password-stdin ${ECR_REGISTRY}

                        docker push ${ECR_REGISTRY}/${ECR_REPO_AUTH}:${IMAGE_TAG}
                        docker push ${ECR_REGISTRY}/${ECR_REPO_AUTH}:latest
                        docker push ${ECR_REGISTRY}/${ECR_REPO_POST}:${IMAGE_TAG}
                        docker push ${ECR_REGISTRY}/${ECR_REPO_POST}:latest
                        docker push ${ECR_REGISTRY}/${ECR_REPO_SEARCH}:${IMAGE_TAG}
                        docker push ${ECR_REGISTRY}/${ECR_REPO_SEARCH}:latest
                        docker push ${ECR_REGISTRY}/${ECR_REPO_ADMIN}:${IMAGE_TAG}
                        docker push ${ECR_REGISTRY}/${ECR_REPO_ADMIN}:latest
                        docker push ${ECR_REGISTRY}/${ECR_REPO_GW}:${IMAGE_TAG}
                        docker push ${ECR_REGISTRY}/${ECR_REPO_GW}:latest
                    """
                }
            }
            post {
                always {
                    sh """
                        docker rmi ${ECR_REGISTRY}/${ECR_REPO_AUTH}:${IMAGE_TAG}   || true
                        docker rmi ${ECR_REGISTRY}/${ECR_REPO_POST}:${IMAGE_TAG}   || true
                        docker rmi ${ECR_REGISTRY}/${ECR_REPO_SEARCH}:${IMAGE_TAG} || true
                        docker rmi ${ECR_REGISTRY}/${ECR_REPO_ADMIN}:${IMAGE_TAG}  || true
                        docker rmi ${ECR_REGISTRY}/${ECR_REPO_GW}:${IMAGE_TAG}     || true
                    """
                }
            }
        }

        // 9. Deploy al EC2
        stage('Deploy to EC2') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-credentials'
                ]]) {
                    // 1. Login a ECR (necesita interpolacion Groovy para las variables)
                    sh """
                        aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}
                    """

                    // 2. Matar TODOS los contenedores (incluye versiones anteriores de docker-compose)
                    //    sh '...' de comilla simple evita que Groovy interprete el $(...) de shell
                    sh 'docker stop $(docker ps -aq) 2>/dev/null || true'
                    sh 'docker rm -f $(docker ps -aq) 2>/dev/null || true'
                    sh 'docker network prune -f || true'
                    sh 'fuser -k 3000/tcp 2>/dev/null || true'
                    sh 'sleep 2'

                    // 3. Copiar init.sql a directorio de Jenkins (tiene permisos de escritura)
                    sh 'cp "$WORKSPACE/init.sql" /var/lib/jenkins/hipstagram-init.sql'

                    // 4. Pull e iniciar microservicios
                    sh """
                        docker pull ${ECR_REGISTRY}/${ECR_REPO_AUTH}:latest
                        docker pull ${ECR_REGISTRY}/${ECR_REPO_POST}:latest
                        docker pull ${ECR_REGISTRY}/${ECR_REPO_SEARCH}:latest
                        docker pull ${ECR_REGISTRY}/${ECR_REPO_ADMIN}:latest
                        docker pull ${ECR_REGISTRY}/${ECR_REPO_GW}:latest

                        docker network create hipstagram-network || true

                        docker run -d --name db \
                          --network hipstagram-network \
                          --memory=256m \
                          -v hipstagram-pgdata:/var/lib/postgresql/data \
                          -v /var/lib/jenkins/hipstagram-init.sql:/docker-entrypoint-initdb.d/init.sql \
                          -e POSTGRES_USER=hipstagram_user \
                          -e POSTGRES_PASSWORD=hipstagram_pass \
                          -e POSTGRES_DB=hipstagram_db \
                          postgres:15-alpine

                        sleep 10

                        docker run -d --name hipstagram-auth-service --network hipstagram-network --memory=128m --env-file ${ENV_FILE} ${ECR_REGISTRY}/${ECR_REPO_AUTH}:latest
                        docker run -d --name hipstagram-post-service --network hipstagram-network --memory=128m --env-file ${ENV_FILE} ${ECR_REGISTRY}/${ECR_REPO_POST}:latest
                        docker run -d --name hipstagram-search-service --network hipstagram-network --memory=128m --env-file ${ENV_FILE} ${ECR_REGISTRY}/${ECR_REPO_SEARCH}:latest
                        docker run -d --name hipstagram-admin-service --network hipstagram-network --memory=128m --env-file ${ENV_FILE} ${ECR_REGISTRY}/${ECR_REPO_ADMIN}:latest

                        docker run -d --name hipstagram-gateway --network hipstagram-network --memory=64m -p 3000:80 ${ECR_REGISTRY}/${ECR_REPO_GW}:latest

                        sleep 8
                        curl -sf http://localhost:3000/api/health && echo "Health check OK" || echo "Health check no responde (continua de todas formas)"
                    """
                }
            }
        }
    }

    // ── Post-pipeline ────────────────────────────────────────────────────────
    post {
        success {
            echo "Pipeline completado con exito. Microservicios desplegados en EC2 (build #${IMAGE_TAG})."
        }
        failure {
            echo "Pipeline falló. Revisa los logs de la etapa que falló."
        }
        always {
            // Limpiar imágenes Docker antiguas para no llenar el disco
            sh 'docker image prune -af --filter "until=24h" || true'
            cleanWs()
        }
    }
}