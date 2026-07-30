package docreport

import "fmt"

type Labels struct {
	Title                string
	OwnerName            string
	Carrier              string
	TransportOrderNumber string
	Origin               string
	Destination          string
	Country              string
	Address              string
	PackageCount         string
	TotalVolume          string
	TotalWeight          string
	TotalEstimatedValue  string
	ShipmentDate         string
	SummarySheet         string
	PackagesSheet        string
	ItemsSheet           string
	PackageHeaders       []string
	ItemHeaders          []string
	NewCondition         string
	UsedCondition        string
	Page                 string
	Of                   string
}

func Localize(locale string) (Labels, error) {
	if locale != "ru" {
		return Labels{}, fmt.Errorf("unsupported locale %q", locale)
	}
	return Labels{
		Title:                "Опись личных вещей",
		OwnerName:            "ФИО владельца",
		Carrier:              "Перевозчик",
		TransportOrderNumber: "Номер заказа транспортной компании:",
		Origin:               "Отправление",
		Destination:          "Назначение",
		Country:              "Страна:",
		Address:              "Адрес:",
		PackageCount:         "Количество грузовых мест",
		TotalVolume:          "Общий объём",
		TotalWeight:          "Общий вес брутто",
		TotalEstimatedValue:  "Общая оценочная стоимость",
		ShipmentDate:         "Дата отправки",
		SummarySheet:         "Сводка",
		PackagesSheet:        "Грузовые места",
		ItemsSheet:           "Предметы",
		PackageHeaders: []string{
			"№", "Номер грузового места", "Наименование", "Описание", "Метки",
			"Вес брутто, кг", "Объём, м³", "Оценочная стоимость", "Валюта",
		},
		ItemHeaders: []string{
			"№", "Номер грузового места", "Наименование", "Описание", "Количество",
			"Категория", "Метки", "Год приобретения", "Состояние", "Серийный номер",
			"Оценочная стоимость", "Валюта",
		},
		NewCondition:  "Новое",
		UsedCondition: "Бывшее в употреблении",
		Page:          "Страница",
		Of:            "из",
	}, nil
}
