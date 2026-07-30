package docreport

import (
	"strconv"
	"strings"
	"time"
)

func localizedDate(value string) string {
	date, err := time.Parse("2006-01-02", value)
	if err != nil {
		return value
	}
	return date.Format("02.01.2006")
}

func formatNumberRU(value float64, precision int) string {
	raw := strconv.FormatFloat(value, 'f', precision, 64)
	parts := strings.SplitN(raw, ".", 2)
	integer := parts[0]
	sign := ""
	if strings.HasPrefix(integer, "-") {
		sign = "-"
		integer = strings.TrimPrefix(integer, "-")
	}
	for index := len(integer) - 3; index > 0; index -= 3 {
		integer = integer[:index] + " " + integer[index:]
	}
	if len(parts) == 1 {
		return sign + integer
	}
	return sign + integer + "," + parts[1]
}

func conditionLabel(labels Labels, condition string) string {
	if condition == "new" {
		return labels.NewCondition
	}
	return labels.UsedCondition
}
