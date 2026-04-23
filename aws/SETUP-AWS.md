# Setup AWS para CI/CD de Hipstagram

Sigue estos pasos en orden. Todos los comandos usan AWS CLI.

## Variables globales (ajusta estos valores)

```bash
export AWS_REGION="us-east-1"
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REPO="hipstagram-backend"
export ECS_CLUSTER="hipstagram-cluster"
export ECS_SERVICE="hipstagram-backend-service"
```

---

## 1. Crear repositorio ECR

```bash
aws ecr create-repository \
  --repository-name hipstagram-backend \
  --region $AWS_REGION

# Anotar la URI que devuelve: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/hipstagram-backend
```

---

## 2. Crear rol IAM para ECS Task Execution

```bash
# Crear el rol
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"Service":"ecs-tasks.amazonaws.com"},
      "Action":"sts:AssumeRole"
    }]
  }'

# Adjuntar política gestionada
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

---

## 3. Crear log group en CloudWatch

```bash
aws logs create-log-group \
  --log-group-name /ecs/hipstagram-backend \
  --region $AWS_REGION
```

---

## 4. Registrar la Task Definition inicial

Edita `aws/ecs-task-definition.json` y reemplaza:
- `YOUR_ACCOUNT_ID` → tu Account ID (obtenido con `aws sts get-caller-identity`)
- Si no usas Secrets Manager, elimina el bloque `"secrets"` y usa solo `"environment"`

```bash
# Registrar la task definition
aws ecs register-task-definition \
  --cli-input-json file://aws/ecs-task-definition.json \
  --region $AWS_REGION
```

---

## 5. Crear Cluster ECS (Fargate)

```bash
aws ecs create-cluster \
  --cluster-name hipstagram-cluster \
  --capacity-providers FARGATE \
  --region $AWS_REGION
```

---

## 6. Crear el Servicio ECS

Necesitas tener:
- Una VPC con al menos 2 subnets públicas
- Un Security Group que permita tráfico en el puerto 3000

```bash
# Obtener subnet IDs y security group de tu VPC por defecto
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
  --query 'Vpcs[0].VpcId' --output text)

SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[0:2].SubnetId' --output text | tr '\t' ',')

# Crear Security Group
SG_ID=$(aws ec2 create-security-group \
  --group-name hipstagram-backend-sg \
  --description "Hipstagram backend security group" \
  --vpc-id $VPC_ID \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 3000 --cidr 0.0.0.0/0

# Crear el servicio
aws ecs create-service \
  --cluster hipstagram-cluster \
  --service-name hipstagram-backend-service \
  --task-definition hipstagram-backend \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=[$SUBNET_IDS],
    securityGroups=[$SG_ID],
    assignPublicIp=ENABLED
  }" \
  --region $AWS_REGION
```

---

## 7. Configurar credenciales en Jenkins

En Jenkins → Manage Jenkins → Credentials → (global) → Add Credential:

| ID | Tipo | Valor |
|----|------|-------|
| `aws-credentials` | AWS Credentials | Access Key + Secret Key de IAM |
| `aws-account-id` | Secret text | Tu Account ID (12 dígitos) |

### Política IAM mínima para el usuario de Jenkins:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "ecs:ListTasks",
        "ecs:DescribeTasks"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::*:role/ecsTaskExecutionRole"
    }
  ]
}
```

---

## 8. Plugins necesarios en Jenkins

Instala desde Manage Jenkins → Plugin Manager:
- **NodeJS Plugin** – para ejecutar npm
- **SonarQube Scanner** – para análisis de código
- **Pipeline AWS Steps** – para `withAWS()`
- **HTML Publisher** – para reportes de cobertura
- **JUnit Plugin** – para resultados de tests
- **Docker Pipeline** – para comandos docker

### Configurar NodeJS en Jenkins:
Manage Jenkins → Tools → NodeJS → Add NodeJS → Name: `NodeJS-18`, Version: `18.x`

### Configurar SonarQube en Jenkins:
Manage Jenkins → Configure System → SonarQube servers:
- Name: `SonarQube`
- Server URL: `http://tu-sonarqube:9000`
- Token: (crear en SonarQube → My Account → Security → Generate Token)

---

## 9. Verificar el pipeline

Una vez configurado Jenkins con el repositorio:
1. Jenkins detecta el `Jenkinsfile` en la raíz del proyecto
2. El pipeline corre automáticamente en cada push

Para verificar manualmente cada etapa local:
```bash
cd backend
npm install    # Install Dependencies
npm run lint   # Lint (0 errores esperados)
npm test       # Unit Tests (21 tests, cobertura >60% en archivos testados)
npm run build  # Build (sin errores)
```
