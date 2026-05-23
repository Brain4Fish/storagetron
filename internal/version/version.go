package version

import "os"

var (
	Version = "dev"
	Commit  = "unknown"
	Date    = "unknown"
)

type InfoPayload struct {
	Version string `json:"version"`
	Commit  string `json:"commit"`
	Date    string `json:"date"`
}

func Info() InfoPayload {
	return InfoPayload{
		Version: valueOrEnv(Version, "APP_VERSION"),
		Commit:  valueOrEnv(Commit, "APP_COMMIT"),
		Date:    valueOrEnv(Date, "APP_BUILD_DATE"),
	}
}

func valueOrEnv(value, key string) string {
	if envValue := os.Getenv(key); envValue != "" {
		return envValue
	}
	return value
}
