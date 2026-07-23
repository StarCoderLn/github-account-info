## 需求一

你只需要帮我拆分实现前两点需求就可以了，后面的两步部署我自己操作，你来指导我。

1. 使用 hono 开发一个接口，我可以通过这个接口使用个人的 token 获取到 github 个人账户信息；

2. 使用 react + tailwindcss 开发一个表单页面，我可以通过这个页面使用 drizzle 进行字段增删改查；

3. 使用 SAM 将项目部署到 AWS 上，并把服务和数据库配置在同一个 VPC 里(一个子网对外能够外网剩下的二个子网部署 lambda)；

4. 编写一个 github actions，给它一个 IAM 的权限部署我的项目。

## 需求二

1. 搭建 GO 的运行环境，使用 GO 链接数据库，把现有项目中 node 数据库代码迁移过来一部分，根据之前使用 GitHub token 获取到的用户名生成一个个人介绍页面。

2. 用 ECR + ECS + ALB + FareGate，用 CloudMap 链接 lambda 接口。

3. 构建一个基于 PR 的分支独立开发环境 ，Cloudflare + CodeBuild+ IAM 三个角色完成 GO 的版本。

## 需求三

1. 完成 AWS Synthetics 巡检任务。

2. 基于之前 GITHUB 项目开发一个 SNS/SQS + 死信队列的场景。

3. 灰度上线 API Canary。
