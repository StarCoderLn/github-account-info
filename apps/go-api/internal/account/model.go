// Package account 定义 GitHub 账号领域数据及其数据库读取逻辑。
package account

// Source 是生成个人介绍所需的账号事实快照。
// *string 表示数据库字段可为 NULL：nil 代表缺失，非 nil 指向真实字符串；
// int32/int64 的位宽显式对应数据库 integer/bigint，避免 GitHub ID 溢出。
type Source struct {
	ID              int32
	GitHubID        int64
	GitHubUsername  string
	Name            *string
	AvatarURL       *string
	Bio             *string
	Company         *string
	Location        *string
	Blog            *string
	TwitterUsername *string
	PublicRepos     int32
	Followers       int32
	Following       int32
}
