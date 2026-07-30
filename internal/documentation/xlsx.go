package docreport

import (
	"context"
	"fmt"
	"io"
	"math"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

type XLSXRenderer struct{}

func NewXLSXRenderer() *XLSXRenderer {
	return &XLSXRenderer{}
}

func (r *XLSXRenderer) Render(ctx context.Context, locale string, writer io.Writer, report PreparedReport) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	labels, err := Localize(locale)
	if err != nil {
		return err
	}

	file := excelize.NewFile()
	defer file.Close()
	summarySheet := labels.SummarySheet
	if err := file.SetSheetName("Sheet1", summarySheet); err != nil {
		return err
	}
	file.NewSheet(labels.PackagesSheet)
	file.NewSheet(labels.ItemsSheet)

	styles, err := newXLSXStyles(file)
	if err != nil {
		return err
	}
	if err := renderXLSXSummary(file, summarySheet, labels, styles, report); err != nil {
		return err
	}
	if err := renderXLSXPackages(file, labels, styles, report); err != nil {
		return err
	}
	if err := renderXLSXItems(file, labels, styles, report); err != nil {
		return err
	}
	file.SetActiveSheet(0)
	return file.Write(writer)
}

type xlsxStyles struct {
	title      int
	section    int
	label      int
	value      int
	orderValue int
	header     int
	text       int
	integer    int
	decimal2   int
	decimal3   int
	decimal4   int
	date       int
}

func newXLSXStyles(file *excelize.File) (xlsxStyles, error) {
	newStyle := func(style *excelize.Style) (int, error) {
		return file.NewStyle(style)
	}
	var styles xlsxStyles
	var err error
	if styles.title, err = newStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 18, Color: "1F2937"},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	}); err != nil {
		return styles, err
	}
	if styles.section, err = newStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 12, Color: "1F2937"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"E8EEF7"}, Pattern: 1},
		Alignment: &excelize.Alignment{Vertical: "center"},
		Border:    []excelize.Border{{Type: "bottom", Color: "9CA3AF", Style: 1}},
	}); err != nil {
		return styles, err
	}
	if styles.label, err = newStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "374151"},
		Alignment: &excelize.Alignment{Vertical: "top", WrapText: true},
	}); err != nil {
		return styles, err
	}
	if styles.value, err = newStyle(&excelize.Style{
		Alignment: &excelize.Alignment{Vertical: "top", WrapText: true},
		Border:    []excelize.Border{{Type: "bottom", Color: "D1D5DB", Style: 1}},
	}); err != nil {
		return styles, err
	}
	if styles.orderValue, err = newStyle(&excelize.Style{
		Alignment: &excelize.Alignment{Vertical: "center", WrapText: true},
		Border:    []excelize.Border{{Type: "bottom", Color: "111827", Style: 2}},
	}); err != nil {
		return styles, err
	}
	if styles.header, err = newStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "FFFFFF", Size: 9},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"344E73"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
		Border: []excelize.Border{
			{Type: "left", Color: "CBD5E1", Style: 1},
			{Type: "right", Color: "CBD5E1", Style: 1},
			{Type: "top", Color: "CBD5E1", Style: 1},
			{Type: "bottom", Color: "CBD5E1", Style: 1},
		},
	}); err != nil {
		return styles, err
	}
	bodyStyle := func(numFmt int, horizontal string) *excelize.Style {
		return &excelize.Style{
			NumFmt: numFmt,
			Alignment: &excelize.Alignment{
				Horizontal: horizontal,
				Vertical:   "top",
				WrapText:   true,
			},
			Border: []excelize.Border{
				{Type: "left", Color: "E5E7EB", Style: 1},
				{Type: "right", Color: "E5E7EB", Style: 1},
				{Type: "top", Color: "E5E7EB", Style: 1},
				{Type: "bottom", Color: "E5E7EB", Style: 1},
			},
		}
	}
	if styles.text, err = newStyle(bodyStyle(0, "left")); err != nil {
		return styles, err
	}
	if styles.integer, err = newStyle(bodyStyle(1, "right")); err != nil {
		return styles, err
	}
	if styles.decimal2, err = newStyle(bodyStyle(4, "right")); err != nil {
		return styles, err
	}
	if styles.decimal3, err = newStyle(&excelize.Style{
		CustomNumFmt: stringPointer("#,##0.000"),
		Alignment:    &excelize.Alignment{Horizontal: "right", Vertical: "top"},
		Border:       bodyStyle(0, "right").Border,
	}); err != nil {
		return styles, err
	}
	if styles.decimal4, err = newStyle(&excelize.Style{
		CustomNumFmt: stringPointer("#,##0.0000"),
		Alignment:    &excelize.Alignment{Horizontal: "right", Vertical: "top"},
		Border:       bodyStyle(0, "right").Border,
	}); err != nil {
		return styles, err
	}
	if styles.date, err = newStyle(&excelize.Style{
		CustomNumFmt: stringPointer("dd.mm.yyyy"),
		Alignment:    &excelize.Alignment{Vertical: "center"},
	}); err != nil {
		return styles, err
	}
	return styles, nil
}

func renderXLSXSummary(file *excelize.File, sheet string, labels Labels, styles xlsxStyles, report PreparedReport) error {
	if err := file.MergeCell(sheet, "A1", "I1"); err != nil {
		return err
	}
	file.SetCellStr(sheet, "A1", labels.Title)
	file.SetCellStyle(sheet, "A1", "I1", styles.title)
	file.SetRowHeight(sheet, 1, 34)

	setSummaryLine := func(row int, label, value string, labelEnd, valueStart string) error {
		if err := file.MergeCell(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("%s%d", labelEnd, row)); err != nil {
			return err
		}
		if err := file.MergeCell(sheet, fmt.Sprintf("%s%d", valueStart, row), fmt.Sprintf("I%d", row)); err != nil {
			return err
		}
		file.SetCellStr(sheet, fmt.Sprintf("A%d", row), label)
		file.SetCellStr(sheet, fmt.Sprintf("%s%d", valueStart, row), value)
		file.SetCellStyle(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("%s%d", labelEnd, row), styles.label)
		file.SetCellStyle(sheet, fmt.Sprintf("%s%d", valueStart, row), fmt.Sprintf("I%d", row), styles.value)
		return nil
	}
	if err := setSummaryLine(3, labels.OwnerName, report.Request.Summary.OwnerName, "B", "C"); err != nil {
		return err
	}
	if err := setSummaryLine(4, labels.Carrier, report.Request.Summary.Carrier, "B", "C"); err != nil {
		return err
	}
	if err := file.MergeCell(sheet, "A5", "D5"); err != nil {
		return err
	}
	if err := file.MergeCell(sheet, "E5", "I5"); err != nil {
		return err
	}
	file.SetCellStr(sheet, "A5", labels.TransportOrderNumber)
	if report.Request.Summary.TransportOrderNumber != "" {
		file.SetCellStr(sheet, "E5", report.Request.Summary.TransportOrderNumber)
	}
	file.SetCellStyle(sheet, "A5", "D5", styles.label)
	file.SetCellStyle(sheet, "E5", "I5", styles.orderValue)
	file.SetRowHeight(sheet, 5, 24)

	for _, merge := range [][2]string{{"A7", "D7"}, {"F7", "I7"}, {"C8", "D8"}, {"H8", "I8"}, {"C9", "D10"}, {"H9", "I10"}} {
		if err := file.MergeCell(sheet, merge[0], merge[1]); err != nil {
			return err
		}
	}
	file.SetCellStr(sheet, "A7", labels.Origin)
	file.SetCellStr(sheet, "F7", labels.Destination)
	file.SetCellStyle(sheet, "A7", "D7", styles.section)
	file.SetCellStyle(sheet, "F7", "I7", styles.section)
	file.SetCellStr(sheet, "A8", labels.Country)
	file.SetCellStr(sheet, "C8", report.Request.Summary.OriginCountry)
	file.SetCellStr(sheet, "F8", labels.Country)
	file.SetCellStr(sheet, "H8", report.Request.Summary.DestinationCountry)
	file.SetCellStr(sheet, "A9", labels.Address)
	file.SetCellStr(sheet, "C9", report.Request.Summary.OriginAddress)
	file.SetCellStr(sheet, "F9", labels.Address)
	file.SetCellStr(sheet, "H9", report.Request.Summary.DestinationAddress)
	file.SetCellStyle(sheet, "A8", "B10", styles.label)
	file.SetCellStyle(sheet, "F8", "G10", styles.label)
	file.SetCellStyle(sheet, "C8", "D10", styles.value)
	file.SetCellStyle(sheet, "H8", "I10", styles.value)
	file.SetRowHeight(sheet, 9, 24)
	file.SetRowHeight(sheet, 10, 30)

	metrics := []struct {
		label string
		value any
		style int
	}{
		{labels.PackageCount, report.PackageCount, styles.integer},
		{labels.TotalVolume, report.TotalVolumeM3, styles.decimal4},
		{labels.TotalWeight, report.TotalWeightKg, styles.decimal3},
	}
	for index, metric := range metrics {
		row := 12 + index
		file.MergeCell(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("D%d", row))
		file.MergeCell(sheet, fmt.Sprintf("E%d", row), fmt.Sprintf("I%d", row))
		file.SetCellStr(sheet, fmt.Sprintf("A%d", row), metric.label)
		file.SetCellValue(sheet, fmt.Sprintf("E%d", row), metric.value)
		file.SetCellStyle(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("D%d", row), styles.label)
		file.SetCellStyle(sheet, fmt.Sprintf("E%d", row), fmt.Sprintf("I%d", row), metric.style)
	}

	file.MergeCell(sheet, "A16", "I16")
	file.SetCellStr(sheet, "A16", labels.TotalEstimatedValue)
	file.SetCellStyle(sheet, "A16", "I16", styles.section)
	currencyRow := 17
	if len(report.CurrencyTotals) == 0 {
		file.MergeCell(sheet, "A17", "D17")
		file.MergeCell(sheet, "E17", "I17")
		file.SetCellStr(sheet, "A17", "—")
		currencyRow++
	} else {
		for _, total := range report.CurrencyTotals {
			file.MergeCell(sheet, fmt.Sprintf("A%d", currencyRow), fmt.Sprintf("D%d", currencyRow))
			file.MergeCell(sheet, fmt.Sprintf("E%d", currencyRow), fmt.Sprintf("I%d", currencyRow))
			file.SetCellStr(sheet, fmt.Sprintf("A%d", currencyRow), total.Currency)
			file.SetCellFloat(sheet, fmt.Sprintf("E%d", currencyRow), total.Amount(), 2, 64)
			file.SetCellStyle(sheet, fmt.Sprintf("A%d", currencyRow), fmt.Sprintf("D%d", currencyRow), styles.label)
			file.SetCellStyle(sheet, fmt.Sprintf("E%d", currencyRow), fmt.Sprintf("I%d", currencyRow), styles.decimal2)
			currencyRow++
		}
	}
	dateRow := currencyRow + 1
	file.MergeCell(sheet, fmt.Sprintf("A%d", dateRow), fmt.Sprintf("D%d", dateRow))
	file.MergeCell(sheet, fmt.Sprintf("E%d", dateRow), fmt.Sprintf("I%d", dateRow))
	file.SetCellStr(sheet, fmt.Sprintf("A%d", dateRow), labels.ShipmentDate)
	date, _ := time.Parse("2006-01-02", report.Request.Summary.ShipmentDate)
	file.SetCellValue(sheet, fmt.Sprintf("E%d", dateRow), date)
	file.SetCellStyle(sheet, fmt.Sprintf("A%d", dateRow), fmt.Sprintf("D%d", dateRow), styles.label)
	file.SetCellStyle(sheet, fmt.Sprintf("E%d", dateRow), fmt.Sprintf("I%d", dateRow), styles.date)

	widths := map[string]float64{"A": 16, "B": 4, "C": 16, "D": 11, "E": 14, "F": 16, "G": 4, "H": 16, "I": 11}
	for column, width := range widths {
		file.SetColWidth(sheet, column, column, width)
	}
	if err := configureXLSXPage(file, sheet, "portrait", 1, 1, dateRow, "I", false); err != nil {
		return err
	}
	return nil
}

func renderXLSXPackages(file *excelize.File, labels Labels, styles xlsxStyles, report PreparedReport) error {
	sheet := labels.PackagesSheet
	for index, header := range labels.PackageHeaders {
		cell, _ := excelize.CoordinatesToCellName(index+1, 1)
		file.SetCellStr(sheet, cell, header)
	}
	file.SetCellStyle(sheet, "A1", "I1", styles.header)
	file.SetRowHeight(sheet, 1, 42)

	for index, row := range report.PackageRows {
		excelRow := index + 2
		values := []any{row.Number, row.PackageID, row.Name, row.Description, row.Labels, nil, nil, nil, row.Currency}
		for column, value := range values {
			cell, _ := excelize.CoordinatesToCellName(column+1, excelRow)
			if text, ok := value.(string); ok {
				if text != "" {
					file.SetCellStr(sheet, cell, text)
				}
			} else if value != nil {
				file.SetCellValue(sheet, cell, value)
			}
		}
		if row.GrossWeightKg != nil {
			file.SetCellFloat(sheet, fmt.Sprintf("F%d", excelRow), *row.GrossWeightKg, 3, 64)
		}
		if row.VolumeM3 != nil {
			file.SetCellFloat(sheet, fmt.Sprintf("G%d", excelRow), *row.VolumeM3, 4, 64)
		}
		if row.EstimatedValue != nil {
			file.SetCellFloat(sheet, fmt.Sprintf("H%d", excelRow), *row.EstimatedValue, 2, 64)
		}
		file.SetCellStyle(sheet, fmt.Sprintf("A%d", excelRow), fmt.Sprintf("E%d", excelRow), styles.text)
		file.SetCellStyle(sheet, fmt.Sprintf("F%d", excelRow), fmt.Sprintf("F%d", excelRow), styles.decimal3)
		file.SetCellStyle(sheet, fmt.Sprintf("G%d", excelRow), fmt.Sprintf("G%d", excelRow), styles.decimal4)
		file.SetCellStyle(sheet, fmt.Sprintf("H%d", excelRow), fmt.Sprintf("H%d", excelRow), styles.decimal2)
		file.SetCellStyle(sheet, fmt.Sprintf("I%d", excelRow), fmt.Sprintf("I%d", excelRow), styles.text)
		file.SetRowHeight(sheet, excelRow, wrappedRowHeight(32,
			wrappedField{row.Name, 22},
			wrappedField{row.Description, 38},
			wrappedField{row.Labels, 24},
		))
	}
	endRow := max(2, len(report.PackageRows)+1)
	widths := []float64{5, 18, 22, 38, 24, 16, 14, 19, 10}
	for index, width := range widths {
		column, _ := excelize.ColumnNumberToName(index + 1)
		file.SetColWidth(sheet, column, column, width)
	}
	file.AutoFilter(sheet, fmt.Sprintf("A1:I%d", endRow), []excelize.AutoFilterOptions{})
	file.SetPanes(sheet, &excelize.Panes{Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"})
	return configureXLSXPage(file, sheet, "landscape", 1, 0, endRow, "I", true)
}

func renderXLSXItems(file *excelize.File, labels Labels, styles xlsxStyles, report PreparedReport) error {
	sheet := labels.ItemsSheet
	for index, header := range labels.ItemHeaders {
		cell, _ := excelize.CoordinatesToCellName(index+1, 1)
		file.SetCellStr(sheet, cell, header)
	}
	file.SetCellStyle(sheet, "A1", "L1", styles.header)
	file.SetRowHeight(sheet, 1, 48)

	for index, row := range report.ItemRows {
		excelRow := index + 2
		year := any(nil)
		if row.AcquisitionYear != nil {
			year = int(*row.AcquisitionYear)
		}
		values := []any{
			row.Number, row.PackageID, row.Name, row.Description, row.Quantity,
			row.Category, row.Labels, year, conditionLabel(labels, row.Condition),
			row.SerialNumber, nil, row.Currency,
		}
		for column, value := range values {
			cell, _ := excelize.CoordinatesToCellName(column+1, excelRow)
			if text, ok := value.(string); ok {
				if text != "" {
					file.SetCellStr(sheet, cell, text)
				}
			} else if value != nil {
				file.SetCellValue(sheet, cell, value)
			}
		}
		if row.EstimatedValue != nil {
			file.SetCellFloat(sheet, fmt.Sprintf("K%d", excelRow), *row.EstimatedValue, 2, 64)
		}
		file.SetCellStyle(sheet, fmt.Sprintf("A%d", excelRow), fmt.Sprintf("D%d", excelRow), styles.text)
		file.SetCellStyle(sheet, fmt.Sprintf("E%d", excelRow), fmt.Sprintf("E%d", excelRow), styles.integer)
		file.SetCellStyle(sheet, fmt.Sprintf("F%d", excelRow), fmt.Sprintf("J%d", excelRow), styles.text)
		file.SetCellStyle(sheet, fmt.Sprintf("K%d", excelRow), fmt.Sprintf("K%d", excelRow), styles.decimal2)
		file.SetCellStyle(sheet, fmt.Sprintf("L%d", excelRow), fmt.Sprintf("L%d", excelRow), styles.text)
		file.SetRowHeight(sheet, excelRow, wrappedRowHeight(36,
			wrappedField{row.Name, 22},
			wrappedField{row.Description, 34},
			wrappedField{row.Category, 18},
			wrappedField{row.Labels, 22},
			wrappedField{conditionLabel(labels, row.Condition), 23},
			wrappedField{row.SerialNumber, 19},
		))
	}
	endRow := max(2, len(report.ItemRows)+1)
	widths := []float64{5, 17, 22, 34, 12, 18, 22, 14, 23, 19, 19, 10}
	for index, width := range widths {
		column, _ := excelize.ColumnNumberToName(index + 1)
		file.SetColWidth(sheet, column, column, width)
	}
	file.AutoFilter(sheet, fmt.Sprintf("A1:L%d", endRow), []excelize.AutoFilterOptions{})
	file.SetPanes(sheet, &excelize.Panes{Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"})
	return configureXLSXPage(file, sheet, "landscape", 1, 0, endRow, "L", true)
}

func configureXLSXPage(file *excelize.File, sheet, orientation string, fitWidth, fitHeight, endRow int, endColumn string, repeatHeader bool) error {
	a4 := 9
	fitToPage := true
	if err := file.SetSheetProps(sheet, &excelize.SheetPropsOptions{FitToPage: &fitToPage}); err != nil {
		return err
	}
	if err := file.SetPageLayout(sheet, &excelize.PageLayoutOptions{
		Size:        &a4,
		Orientation: &orientation,
		FitToWidth:  &fitWidth,
		FitToHeight: &fitHeight,
	}); err != nil {
		return err
	}
	margin := 0.35
	headerFooter := 0.2
	center := true
	if err := file.SetPageMargins(sheet, &excelize.PageLayoutMarginsOptions{
		Left: &margin, Right: &margin, Top: &margin, Bottom: &margin,
		Header: &headerFooter, Footer: &headerFooter, Horizontally: &center,
	}); err != nil {
		return err
	}
	gridlines := false
	zoom := 90.0
	if err := file.SetSheetView(sheet, 0, &excelize.ViewOptions{ShowGridLines: &gridlines, ZoomScale: &zoom}); err != nil {
		return err
	}
	escapedSheet := "'" + sheet + "'"
	if err := file.SetDefinedName(&excelize.DefinedName{
		Name:     "_xlnm.Print_Area",
		RefersTo: fmt.Sprintf("%s!$A$1:$%s$%d", escapedSheet, endColumn, endRow),
		Scope:    sheet,
	}); err != nil {
		return err
	}
	if repeatHeader {
		if err := file.SetDefinedName(&excelize.DefinedName{
			Name:     "_xlnm.Print_Titles",
			RefersTo: escapedSheet + "!$1:$1",
			Scope:    sheet,
		}); err != nil {
			return err
		}
	}
	return nil
}

func stringPointer(value string) *string {
	return &value
}

type wrappedField struct {
	text  string
	width float64
}

func wrappedRowHeight(minimum float64, fields ...wrappedField) float64 {
	lines := 1
	for _, field := range fields {
		fieldLines := 0
		for _, paragraph := range strings.Split(field.text, "\n") {
			fieldLines += max(1, int(math.Ceil(float64(len([]rune(paragraph)))/math.Max(1, field.width-2))))
		}
		lines = max(lines, fieldLines)
	}
	return math.Min(180, math.Max(minimum, float64(lines)*15+8))
}
