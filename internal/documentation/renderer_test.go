package docreport

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/google/uuid"
	pdfreader "github.com/ledongthuc/pdf"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"
)

func representativePreparedReport(orderNumber string) PreparedReport {
	rub := "RUB"
	report := PrepareReport(
		model.CreateDocumentationReportRequest{
			Scope:    model.DocumentationScope{Type: "location", LocationID: uuidPointer(uuid.New())},
			Format:   "xlsx",
			Language: "ru",
			Summary: &model.DocumentationSummary{
				OwnerName: "Иван Иванов", Carrier: "Тестовая транспортная компания",
				TransportOrderNumber: orderNumber,
				OriginCountry:        "Россия", OriginAddress: "Москва, длинный адрес отправления, дом 1",
				DestinationCountry: "Казахстан", DestinationAddress: "Алматы, длинный адрес назначения, дом 2",
				ShipmentDate: "2026-08-01",
			},
		},
		ScopeSnapshot{
			Type: "location",
			Containers: []ContainerSnapshot{{
				ID: uuid.New(), PackageCode: "PKG-001", Name: "Коробка с личными вещами",
				Description: "Плотная коробка; хрупкое содержимое", Labels: []string{"Хрупкое", "Верх"},
				GrossWeightKg: floatPointer(12.345), VolumeM3: floatPointer(0.1234),
				Items: []ItemSnapshot{{
					ID: uuid.New(), Name: "Фотоаппарат", Description: "Камера с объективом и зарядным устройством",
					Quantity: 1, Category: "Электроника", Condition: "used", SerialNumber: "SN-001",
					EstimatedValue: floatPointer(1000.25), ValueCurrency: &rub, Labels: []string{"Ценное"},
				}},
			}},
			LooseItems: []ItemSnapshot{{
				ID: uuid.New(), Name: "Самокат", Description: "Складной городской самокат",
				Quantity: 1, Category: "Спорт", Condition: "new",
				EstimatedValue: floatPointer(250.50), ValueCurrency: &rub,
			}},
		},
	)
	return report
}

func TestXLSXSheetsHeadersPackageIDsAndOrderField(t *testing.T) {
	for _, orderNumber := range []string{"ORDER-12345", ""} {
		t.Run("order="+orderNumber, func(t *testing.T) {
			var output bytes.Buffer
			err := NewXLSXRenderer().Render(context.Background(), "ru", &output, representativePreparedReport(orderNumber))
			require.NoError(t, err)
			workbook, err := excelize.OpenReader(bytes.NewReader(output.Bytes()))
			require.NoError(t, err)
			defer workbook.Close()

			require.Equal(t, []string{"Сводка", "Грузовые места", "Предметы"}, workbook.GetSheetList())
			labels, err := Localize("ru")
			require.NoError(t, err)
			require.Equal(t, labels.PackageHeaders, rowValues(t, workbook, "Грузовые места", 1, len(labels.PackageHeaders)))
			require.Equal(t, labels.ItemHeaders, rowValues(t, workbook, "Предметы", 1, len(labels.ItemHeaders)))
			require.Equal(t, "PKG-001", mustCell(t, workbook, "Предметы", "B2"))
			require.Empty(t, mustCell(t, workbook, "Предметы", "B3"))
			require.Equal(t, orderNumber, mustCell(t, workbook, "Сводка", "E5"))
			require.Equal(t, "Номер заказа транспортной компании:", mustCell(t, workbook, "Сводка", "A5"))
			if orderNumber == "" {
				styleID, err := workbook.GetCellStyle("Сводка", "E5")
				require.NoError(t, err)
				style, err := workbook.GetStyle(styleID)
				require.NoError(t, err)
				require.Condition(t, func() bool {
					for _, border := range style.Border {
						if border.Type == "bottom" && border.Style > 0 {
							return true
						}
					}
					return false
				}, "empty order cell must have a bottom border")
			}
		})
	}
}

func TestPDFFirstPageContainsSummaryOrderCyrillicAndPageNumbers(t *testing.T) {
	report := representativePreparedReport("ORDER-98765")
	for index := 0; index < 55; index++ {
		report.ItemRows = append(report.ItemRows, ItemRow{
			Number: index + 3, PackageID: "PKG-001", Name: "Длинное наименование предмета",
			Description: strings.Repeat("Описание с кириллицей и переносом текста. ", 3),
			Quantity:    1, Category: "Категория", Condition: "used",
		})
	}
	var output bytes.Buffer
	require.NoError(t, NewPDFRenderer().Render(context.Background(), "ru", &output, report))

	path := filepath.Join(t.TempDir(), "report.pdf")
	require.NoError(t, os.WriteFile(path, output.Bytes(), 0o600))
	file, reader, err := pdfreader.Open(path)
	require.NoError(t, err)
	defer file.Close()
	require.GreaterOrEqual(t, reader.NumPage(), 4)

	firstPage, err := reader.Page(1).GetPlainText(nil)
	require.NoError(t, err)
	require.Contains(t, firstPage, "Опись личных вещей")
	require.Contains(t, firstPage, "Иван Иванов")
	require.Contains(t, firstPage, "ORDER-98765")
	require.NotContains(t, firstPage, "Грузовые места")
	require.Contains(t, firstPage, "Страница 1 из")

	secondPage, err := reader.Page(2).GetPlainText(nil)
	require.NoError(t, err)
	require.Contains(t, secondPage, "Грузовые места")
	require.Contains(t, secondPage, "PKG-001")
	lastPage, err := reader.Page(reader.NumPage()).GetPlainText(nil)
	require.NoError(t, err)
	require.Contains(t, lastPage, "Страница")
}

func TestPDFEmptyOrderLeavesSignedLine(t *testing.T) {
	var output bytes.Buffer
	require.NoError(t, NewPDFRenderer().Render(context.Background(), "ru", &output, representativePreparedReport("")))
	require.Greater(t, output.Len(), 1000)
}

func rowValues(t *testing.T, workbook *excelize.File, sheet string, row, columns int) []string {
	t.Helper()
	values := make([]string, 0, columns)
	for column := 1; column <= columns; column++ {
		cell, err := excelize.CoordinatesToCellName(column, row)
		require.NoError(t, err)
		values = append(values, mustCell(t, workbook, sheet, cell))
	}
	return values
}

func mustCell(t *testing.T, workbook *excelize.File, sheet, cell string) string {
	t.Helper()
	value, err := workbook.GetCellValue(sheet, cell)
	require.NoError(t, err)
	return value
}
