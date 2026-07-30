package docreport

import (
	"math"
	"sort"
	"strings"

	"github.com/Brain4Fish/storagetron/pkg/model"
)

func PrepareReport(req model.CreateDocumentationReportRequest, scope ScopeSnapshot) PreparedReport {
	sort.Slice(scope.Containers, func(i, j int) bool {
		left := strings.ToLower(scope.Containers[i].PackageID())
		right := strings.ToLower(scope.Containers[j].PackageID())
		if left == right {
			return scope.Containers[i].ID.String() < scope.Containers[j].ID.String()
		}
		return left < right
	})

	totals := make(map[string]int64)
	report := PreparedReport{
		Request:      req,
		Scope:        scope,
		PackageCount: len(scope.Containers),
	}

	seenItems := make(map[string]struct{})
	itemNumber := 1
	for packageIndex := range scope.Containers {
		container := &scope.Containers[packageIndex]
		sortItems(container.Items)
		uniqueItems := container.Items[:0]
		for _, item := range container.Items {
			key := item.ID.String()
			if _, exists := seenItems[key]; exists {
				continue
			}
			seenItems[key] = struct{}{}
			uniqueItems = append(uniqueItems, item)
		}
		container.Items = uniqueItems
		packageID := container.PackageID()
		packageCurrencies := make(map[string]int64)

		if container.GrossWeightKg != nil {
			report.TotalWeightKg += *container.GrossWeightKg
		}
		if container.VolumeM3 != nil {
			report.TotalVolumeM3 += *container.VolumeM3
		}

		for _, item := range container.Items {
			if item.EstimatedValue != nil && item.ValueCurrency != nil {
				packageCurrencies[*item.ValueCurrency] += moneyMinor(*item.EstimatedValue)
			}
			report.ItemRows = append(report.ItemRows, itemRow(itemNumber, packageID, item))
			itemNumber++
		}

		var packageValue *float64
		var packageCurrency string
		if container.EstimatedValue != nil && container.ValueCurrency != nil {
			value := *container.EstimatedValue
			packageValue = &value
			packageCurrency = *container.ValueCurrency
			totals[packageCurrency] += moneyMinor(value)
		} else {
			for currency, amount := range packageCurrencies {
				totals[currency] += amount
			}
			if len(packageCurrencies) == 1 {
				for currency, amount := range packageCurrencies {
					value := float64(amount) / 100
					packageValue = &value
					packageCurrency = currency
				}
			}
		}

		report.PackageRows = append(report.PackageRows, PackageRow{
			Number:         packageIndex + 1,
			PackageID:      packageID,
			Name:           container.Name,
			Description:    container.Description,
			Labels:         strings.Join(container.Labels, ", "),
			GrossWeightKg:  container.GrossWeightKg,
			VolumeM3:       container.VolumeM3,
			EstimatedValue: packageValue,
			Currency:       packageCurrency,
		})
	}

	sortItems(scope.LooseItems)
	uniqueLooseItems := scope.LooseItems[:0]
	for _, item := range scope.LooseItems {
		if _, exists := seenItems[item.ID.String()]; exists {
			continue
		}
		seenItems[item.ID.String()] = struct{}{}
		uniqueLooseItems = append(uniqueLooseItems, item)
		if item.EstimatedValue != nil && item.ValueCurrency != nil {
			totals[*item.ValueCurrency] += moneyMinor(*item.EstimatedValue)
		}
		report.ItemRows = append(report.ItemRows, itemRow(itemNumber, "", item))
		itemNumber++
	}
	scope.LooseItems = uniqueLooseItems
	report.Scope = scope

	currencies := make([]string, 0, len(totals))
	for currency := range totals {
		currencies = append(currencies, currency)
	}
	sort.Strings(currencies)
	for _, currency := range currencies {
		report.CurrencyTotals = append(report.CurrencyTotals, MoneyTotal{
			Currency:   currency,
			MinorUnits: totals[currency],
		})
	}
	return report
}

func sortItems(items []ItemSnapshot) {
	sort.Slice(items, func(i, j int) bool {
		left := strings.ToLower(items[i].Name)
		right := strings.ToLower(items[j].Name)
		if left == right {
			return items[i].ID.String() < items[j].ID.String()
		}
		return left < right
	})
}

func itemRow(number int, packageID string, item ItemSnapshot) ItemRow {
	currency := ""
	if item.ValueCurrency != nil {
		currency = *item.ValueCurrency
	}
	return ItemRow{
		Number:          number,
		PackageID:       packageID,
		Name:            item.Name,
		Description:     item.Description,
		Quantity:        item.Quantity,
		Category:        item.Category,
		Labels:          strings.Join(item.Labels, ", "),
		AcquisitionYear: item.AcquisitionYear,
		Condition:       item.Condition,
		SerialNumber:    item.SerialNumber,
		EstimatedValue:  item.EstimatedValue,
		Currency:        currency,
	}
}

func moneyMinor(value float64) int64 {
	return int64(math.Round(value * 100))
}
