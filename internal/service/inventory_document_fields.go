package service

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/Brain4Fish/storagetron/pkg/model"
)

var currencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)

type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string {
	return e.Message
}

func IsValidationError(err error) bool {
	var validationErr *ValidationError
	return errors.As(err, &validationErr)
}

func validationError(format string, args ...any) error {
	return &ValidationError{Message: fmt.Sprintf(format, args...)}
}

func itemFromCreateRequest(req model.CreateItemRequest) (model.Item, error) {
	quantity := 1
	if req.Quantity != nil {
		quantity = *req.Quantity
	}
	condition := "used"
	if req.Condition != nil {
		condition = *req.Condition
	}

	item := model.Item{
		Name:            req.Name,
		Description:     req.Description,
		LocationID:      req.LocationID,
		Quantity:        quantity,
		Category:        req.Category,
		AcquisitionYear: req.AcquisitionYear,
		Condition:       condition,
		SerialNumber:    req.SerialNumber,
		EstimatedValue:  req.EstimatedValue,
		ValueCurrency:   req.ValueCurrency,
		SourceLanguage:  "ru",
	}
	normalizeItemDocumentFields(&item)
	if err := validateItem(item); err != nil {
		return model.Item{}, err
	}
	return item, nil
}

func applyItemUpdate(item *model.Item, req model.UpdateItemRequest) error {
	item.Name = req.Name
	item.Description = req.Description
	item.LocationID = req.LocationID

	if req.Quantity.Set {
		if req.Quantity.Value == nil {
			return validationError("quantity cannot be null")
		}
		item.Quantity = *req.Quantity.Value
	}
	if req.Category.Set {
		if req.Category.Value == nil {
			return validationError("category cannot be null")
		}
		item.Category = *req.Category.Value
	}
	if req.AcquisitionYear.Set {
		item.AcquisitionYear = req.AcquisitionYear.Value
	}
	if req.Condition.Set {
		if req.Condition.Value == nil {
			return validationError("condition cannot be null")
		}
		item.Condition = *req.Condition.Value
	}
	if req.SerialNumber.Set {
		if req.SerialNumber.Value == nil {
			return validationError("serial_number cannot be null")
		}
		item.SerialNumber = *req.SerialNumber.Value
	}
	if req.EstimatedValue.Set {
		item.EstimatedValue = req.EstimatedValue.Value
	}
	if req.ValueCurrency.Set {
		item.ValueCurrency = req.ValueCurrency.Value
	}

	normalizeItemDocumentFields(item)
	return validateItem(*item)
}

func normalizeItemDocumentFields(item *model.Item) {
	item.Category = strings.TrimSpace(item.Category)
	item.Condition = strings.ToLower(strings.TrimSpace(item.Condition))
	item.SerialNumber = strings.TrimSpace(item.SerialNumber)
	item.ValueCurrency = normalizeCurrency(item.ValueCurrency)
	item.SourceLanguage = "ru"
}

func validateItem(item model.Item) error {
	if strings.TrimSpace(item.Name) == "" {
		return validationError("name is required")
	}
	if item.Quantity <= 0 {
		return validationError("quantity must be greater than 0")
	}
	if item.Condition != "new" && item.Condition != "used" {
		return validationError("condition must be new or used")
	}
	if item.EstimatedValue != nil && *item.EstimatedValue < 0 {
		return validationError("estimated_value must be 0 or greater")
	}
	return validateValueCurrency(item.EstimatedValue, item.ValueCurrency)
}

func containerFromCreateRequest(req model.CreateContainerRequest) (model.Container, error) {
	container := model.Container{
		Name:           req.Name,
		Description:    req.Description,
		LocationID:     req.LocationID,
		PackageCode:    req.PackageCode,
		GrossWeightKg:  req.GrossWeightKg,
		VolumeM3:       req.VolumeM3,
		EstimatedValue: req.EstimatedValue,
		ValueCurrency:  req.ValueCurrency,
		SourceLanguage: "ru",
	}
	normalizeContainerDocumentFields(&container)
	if err := validateContainer(container); err != nil {
		return model.Container{}, err
	}
	return container, nil
}

func applyContainerUpdate(container *model.Container, req model.UpdateContainerRequest) error {
	container.Name = req.Name
	container.Description = req.Description
	container.LocationID = req.LocationID

	if req.PackageCode.Set {
		if req.PackageCode.Value == nil {
			return validationError("package_code cannot be null")
		}
		container.PackageCode = *req.PackageCode.Value
	}
	if req.GrossWeightKg.Set {
		container.GrossWeightKg = req.GrossWeightKg.Value
	}
	if req.VolumeM3.Set {
		container.VolumeM3 = req.VolumeM3.Value
	}
	if req.EstimatedValue.Set {
		container.EstimatedValue = req.EstimatedValue.Value
	}
	if req.ValueCurrency.Set {
		container.ValueCurrency = req.ValueCurrency.Value
	}

	normalizeContainerDocumentFields(container)
	return validateContainer(*container)
}

func normalizeContainerDocumentFields(container *model.Container) {
	container.PackageCode = strings.TrimSpace(container.PackageCode)
	container.ValueCurrency = normalizeCurrency(container.ValueCurrency)
	container.SourceLanguage = "ru"
}

func validateContainer(container model.Container) error {
	if strings.TrimSpace(container.Name) == "" {
		return validationError("name is required")
	}
	if container.GrossWeightKg != nil && *container.GrossWeightKg <= 0 {
		return validationError("gross_weight_kg must be greater than 0")
	}
	if container.VolumeM3 != nil && *container.VolumeM3 <= 0 {
		return validationError("volume_m3 must be greater than 0")
	}
	if container.EstimatedValue != nil && *container.EstimatedValue < 0 {
		return validationError("estimated_value must be 0 or greater")
	}
	return validateValueCurrency(container.EstimatedValue, container.ValueCurrency)
}

func normalizeCurrency(currency *string) *string {
	if currency == nil {
		return nil
	}
	normalized := strings.ToUpper(strings.TrimSpace(*currency))
	return &normalized
}

func validateValueCurrency(value *float64, currency *string) error {
	if value == nil && currency == nil {
		return nil
	}
	if value == nil {
		return validationError("value_currency requires estimated_value")
	}
	if currency == nil {
		return validationError("value_currency is required when estimated_value is set")
	}
	if !currencyPattern.MatchString(*currency) {
		return validationError("value_currency must be a three-letter ISO code")
	}
	return nil
}
