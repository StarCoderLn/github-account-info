package account

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
