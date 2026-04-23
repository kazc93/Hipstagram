pipeline {
    agent any

    // ── Variables de entorno ─────────────────────────────────────────────────
    environment {
        AWS_REGION      = 'us-east-1'
        AWS_ACCOUNT_ID  = '630171690893'

        ECR_REGISTRY    = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
        ECR_REPO        = 'hipstagram-backend'
        IMAGE_TAG       = "${env.BUILD_NUMBER}"
        FULL_IMAGE      = "${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"

        SONAR_SERVER    = 'SonarQube'
        ENV_FILE        = '/etc/hipstagram.env'
    }

    tools {
        nodejs 'NodeJS-18'   // nombre del NodeJS configurado en Jenkins > Global Tools
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
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

        // 2. Instalar dependencias
        stage('Install Dependencies') {
            steps {
                dir('backend') {
                    sh 'npm ci'
                }
            }
        }

        // 3. Escaneo de dependencias + Lint
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

        // 6. Quality Gate (espera el resultado de SonarQube)
        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: false
                }
            }
        }

        // 7. Build Docker
        stage('Build Docker Image') {
            steps {
                dir('backend') {
                    sh "docker build -t ${FULL_IMAGE} -t ${ECR_REGISTRY}/${ECR_REPO}:latest ."
                }
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

                        docker push ${FULL_IMAGE}
                        docker push ${ECR_REGISTRY}/${ECR_REPO}:latest
                    """
                }
            }
            post {
                always {
                    sh "docker rmi ${FULL_IMAGE} || true"
                    sh "docker rmi ${ECR_REGISTRY}/${ECR_REPO}:latest || true"
                }
            }
        }

        // 9. Deploy al EC2 (Docker directo — IP estable, HTTPS via Nginx)
        stage('Deploy to EC2') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-credentials'
                ]]) {
                    sh """
                        aws ecr get-login-password --region ${AWS_REGION} \
                          | docker login --username AWS --password-stdin ${ECR_REGISTRY}

                        docker pull ${FULL_IMAGE}

                        docker stop hipstagram-backend || true
                        docker rm   hipstagram-backend || true

                        docker run -d \
                          --name hipstagram-backend \
                          --restart unless-stopped \
                          -p 3000:3000 \
                          --env-file ${ENV_FILE} \
                          ${FULL_IMAGE}

                        echo "Smoke test..."
                        sleep 6
                        curl -sf http://localhost:3000/api/health \
                          && echo "Health check OK" \
                          || echo "Health check no responde (continua de todas formas)"
                    """
                }
            }
        }
    }

    // ── Post-pipeline ────────────────────────────────────────────────────────
    post {
        success {
            echo "Pipeline completado con exito. Imagen: ${FULL_IMAGE} desplegada en EC2."
        }
        failure {
            echo "❌ Pipeline falló. Revisa los logs de la etapa que falló."
        }
        always {
            cleanWs()
        }
    }
}
