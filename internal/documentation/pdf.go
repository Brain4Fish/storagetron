package docreport

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math"
	"strings"

	"github.com/signintech/gopdf"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/goregular"
)

const (
	pdfPageWidth    = 841.89
	pdfPageHeight   = 595.28
	pdfMargin       = 28.0
	pdfContentWidth = pdfPageWidth - 2*pdfMargin
	pdfFooterY      = pdfPageHeight - 22
)

type PDFRenderer struct{}

func NewPDFRenderer() *PDFRenderer {
	return &PDFRenderer{}
}

func (r *PDFRenderer) Render(ctx context.Context, locale string, writer io.Writer, report PreparedReport) error {
	labels, err := Localize(locale)
	if err != nil {
		return err
	}
	pdf := &gopdf.GoPdf{}
	pdf.Start(gopdf.Config{PageSize: gopdf.Rect{W: pdfPageWidth, H: pdfPageHeight}})
	pdf.SetMargins(pdfMargin, pdfMargin, pdfMargin, 30)
	if err := pdf.AddTTFFontByReaderWithOption("Go", bytes.NewReader(goregular.TTF), gopdf.TtfOption{Style: gopdf.Regular, UseKerning: true}); err != nil {
		return fmt.Errorf("add regular PDF font: %w", err)
	}
	if err := pdf.AddTTFFontByReaderWithOption("Go", bytes.NewReader(gobold.TTF), gopdf.TtfOption{Style: gopdf.Bold, UseKerning: true}); err != nil {
		return fmt.Errorf("add bold PDF font: %w", err)
	}
	if err := pdf.SetFont("Go", "", 9); err != nil {
		return err
	}
	pdf.SetInfo(gopdf.PdfInfo{Title: labels.Title, Author: "Storagetron"})
	pdf.AddFooter(func() {
		_ = pdf.SetFont("Go", "", 8)
		pdf.SetTextColor(75, 85, 99)
		pdf.SetXY(pdfMargin, pdfFooterY)
		_ = pdf.Text(fmt.Sprintf("%s %d %s ", labels.Page, pdf.GetNumberOfPages(), labels.Of))
		_ = pdf.PlaceHolderText("documentation-total-pages", 24)
		pdf.SetTextColor(17, 24, 39)
	})

	pdf.AddPage()
	if err := renderPDFSummary(pdf, labels, report); err != nil {
		return err
	}
	if err := renderPDFPackages(ctx, pdf, labels, report.PackageRows); err != nil {
		return err
	}
	if err := renderPDFItems(ctx, pdf, labels, report.ItemRows); err != nil {
		return err
	}
	if err := pdf.FillInPlaceHoldText("documentation-total-pages", fmt.Sprintf("%d", pdf.GetNumberOfPages()), gopdf.Left); err != nil {
		return err
	}
	_, err = pdf.WriteTo(writer)
	return err
}

func renderPDFSummary(pdf *gopdf.GoPdf, labels Labels, report PreparedReport) error {
	pdf.SetFillColor(52, 78, 115)
	pdf.RectFromUpperLeftWithStyle(pdfMargin, pdfMargin, pdfContentWidth, 44, "F")
	if err := pdf.SetFont("Go", "B", 20); err != nil {
		return err
	}
	pdf.SetTextColor(255, 255, 255)
	pdf.SetXY(pdfMargin+12, pdfMargin+11)
	pdf.Cell(nil, labels.Title)
	pdf.SetTextColor(17, 24, 39)

	y := 88.0
	if err := pdfSummaryLine(pdf, labels.OwnerName, report.Request.Summary.OwnerName, y); err != nil {
		return err
	}
	y += 28
	if err := pdfSummaryLine(pdf, labels.Carrier, report.Request.Summary.Carrier, y); err != nil {
		return err
	}
	y += 28
	if err := pdfOrderLine(pdf, labels.TransportOrderNumber, report.Request.Summary.TransportOrderNumber, y); err != nil {
		return err
	}

	y += 46
	columnWidth := (pdfContentWidth - 24) / 2
	if err := pdfSummaryAddressBlock(pdf, labels.Origin, labels, report.Request.Summary.OriginCountry, report.Request.Summary.OriginAddress, pdfMargin, y, columnWidth); err != nil {
		return err
	}
	if err := pdfSummaryAddressBlock(pdf, labels.Destination, labels, report.Request.Summary.DestinationCountry, report.Request.Summary.DestinationAddress, pdfMargin+columnWidth+24, y, columnWidth); err != nil {
		return err
	}

	y += 116
	if err := pdf.SetFont("Go", "B", 10); err != nil {
		return err
	}
	metrics := []struct{ label, value string }{
		{labels.PackageCount, fmt.Sprintf("%d", report.PackageCount)},
		{labels.TotalVolume, formatNumberRU(report.TotalVolumeM3, 4) + " м³"},
		{labels.TotalWeight, formatNumberRU(report.TotalWeightKg, 3) + " кг"},
	}
	for _, metric := range metrics {
		pdf.SetXY(pdfMargin, y)
		pdf.CellWithOption(&gopdf.Rect{W: 250, H: 22}, metric.label, gopdf.CellOption{Align: gopdf.Left | gopdf.Middle})
		_ = pdf.SetFont("Go", "", 10)
		pdf.SetXY(pdfMargin+260, y)
		pdf.CellWithOption(&gopdf.Rect{W: 180, H: 22}, metric.value, gopdf.CellOption{Align: gopdf.Left | gopdf.Middle})
		_ = pdf.SetFont("Go", "B", 10)
		y += 24
	}

	pdf.SetXY(pdfMargin+470, y-72)
	pdf.Cell(nil, labels.TotalEstimatedValue)
	_ = pdf.SetFont("Go", "", 10)
	currencyY := y - 46
	if len(report.CurrencyTotals) == 0 {
		pdf.SetXY(pdfMargin+470, currencyY)
		pdf.Cell(nil, "—")
	} else {
		for _, total := range report.CurrencyTotals {
			pdf.SetXY(pdfMargin+470, currencyY)
			pdf.Cell(nil, fmt.Sprintf("%s: %s", total.Currency, formatNumberRU(total.Amount(), 2)))
			currencyY += 20
		}
	}
	_ = pdf.SetFont("Go", "B", 10)
	pdf.SetXY(pdfMargin, 510)
	pdf.Cell(nil, labels.ShipmentDate)
	_ = pdf.SetFont("Go", "", 10)
	pdf.SetXY(pdfMargin+145, 510)
	pdf.Cell(nil, localizedDate(report.Request.Summary.ShipmentDate))
	return nil
}

func pdfSummaryLine(pdf *gopdf.GoPdf, label, value string, y float64) error {
	if err := pdf.SetFont("Go", "B", 10); err != nil {
		return err
	}
	pdf.SetXY(pdfMargin, y)
	pdf.CellWithOption(&gopdf.Rect{W: 190, H: 22}, label, gopdf.CellOption{Align: gopdf.Left | gopdf.Middle})
	if err := pdf.SetFont("Go", "", 10); err != nil {
		return err
	}
	pdf.SetXY(pdfMargin+200, y)
	pdf.CellWithOption(&gopdf.Rect{W: pdfContentWidth - 200, H: 22}, value, gopdf.CellOption{Align: gopdf.Left | gopdf.Middle})
	pdf.SetStrokeColor(209, 213, 219)
	pdf.Line(pdfMargin+200, y+22, pdfMargin+pdfContentWidth, y+22)
	return nil
}

func pdfOrderLine(pdf *gopdf.GoPdf, label, value string, y float64) error {
	if err := pdf.SetFont("Go", "B", 10); err != nil {
		return err
	}
	labelWidth := 245.0
	pdf.SetXY(pdfMargin, y)
	pdf.CellWithOption(&gopdf.Rect{W: labelWidth, H: 24}, label, gopdf.CellOption{Align: gopdf.Left | gopdf.Middle})
	if err := pdf.SetFont("Go", "", 10); err != nil {
		return err
	}
	pdf.SetXY(pdfMargin+labelWidth, y)
	pdf.CellWithOption(&gopdf.Rect{W: pdfContentWidth - labelWidth, H: 24}, value, gopdf.CellOption{Align: gopdf.Left | gopdf.Middle})
	pdf.SetStrokeColor(17, 24, 39)
	pdf.SetLineWidth(0.8)
	pdf.Line(pdfMargin+labelWidth, y+24, pdfMargin+pdfContentWidth, y+24)
	pdf.SetLineWidth(0.3)
	return nil
}

func pdfSummaryAddressBlock(pdf *gopdf.GoPdf, title string, labels Labels, country, address string, x, y, width float64) error {
	pdf.SetFillColor(232, 238, 247)
	pdf.RectFromUpperLeftWithStyle(x, y, width, 28, "F")
	if err := pdf.SetFont("Go", "B", 11); err != nil {
		return err
	}
	pdf.SetXY(x+8, y+6)
	pdf.Cell(nil, title)
	y += 36
	if err := pdf.SetFont("Go", "B", 9); err != nil {
		return err
	}
	pdf.SetXY(x, y)
	pdf.Cell(nil, labels.Country)
	_ = pdf.SetFont("Go", "", 9)
	pdf.SetXY(x+62, y)
	pdf.Cell(nil, country)
	y += 24
	_ = pdf.SetFont("Go", "B", 9)
	pdf.SetXY(x, y)
	pdf.Cell(nil, labels.Address)
	_ = pdf.SetFont("Go", "", 9)
	pdf.SetXY(x+62, y-2)
	return pdf.MultiCellWithOption(&gopdf.Rect{W: width - 62, H: 48}, address, gopdf.CellOption{Align: gopdf.Left | gopdf.Top, CoefLineHeight: 1.15})
}

func renderPDFPackages(ctx context.Context, pdf *gopdf.GoPdf, labels Labels, rows []PackageRow) error {
	columns := []pdfColumn{
		{labels.PackageHeaders[0], 24, gopdf.Center},
		{labels.PackageHeaders[1], 76, gopdf.Left},
		{labels.PackageHeaders[2], 112, gopdf.Left},
		{labels.PackageHeaders[3], 174, gopdf.Left},
		{labels.PackageHeaders[4], 95, gopdf.Left},
		{labels.PackageHeaders[5], 62, gopdf.Right},
		{labels.PackageHeaders[6], 56, gopdf.Right},
		{labels.PackageHeaders[7], 92, gopdf.Right},
		{labels.PackageHeaders[8], 50, gopdf.Center},
	}
	table := newPDFTable(pdf, labels.PackagesSheet, columns)
	if err := table.startSection(); err != nil {
		return err
	}
	for _, row := range rows {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		weight := ""
		if row.GrossWeightKg != nil {
			weight = formatNumberRU(*row.GrossWeightKg, 3)
		}
		volume := ""
		if row.VolumeM3 != nil {
			volume = formatNumberRU(*row.VolumeM3, 4)
		}
		value := ""
		if row.EstimatedValue != nil {
			value = formatNumberRU(*row.EstimatedValue, 2)
		}
		if err := table.addRow([]string{
			fmt.Sprintf("%d", row.Number), row.PackageID, row.Name, row.Description, row.Labels,
			weight, volume, value, row.Currency,
		}); err != nil {
			return err
		}
	}
	if len(rows) == 0 {
		return table.addRow([]string{"", "", "—", "", "", "", "", "", ""})
	}
	return nil
}

func renderPDFItems(ctx context.Context, pdf *gopdf.GoPdf, labels Labels, rows []ItemRow) error {
	columns := []pdfColumn{
		{labels.ItemHeaders[0], 22, gopdf.Center},
		{labels.ItemHeaders[1], 60, gopdf.Left},
		{labels.ItemHeaders[2], 95, gopdf.Left},
		{labels.ItemHeaders[3], 125, gopdf.Left},
		{labels.ItemHeaders[4], 35, gopdf.Right},
		{labels.ItemHeaders[5], 65, gopdf.Left},
		{labels.ItemHeaders[6], 70, gopdf.Left},
		{labels.ItemHeaders[7], 45, gopdf.Center},
		{labels.ItemHeaders[8], 75, gopdf.Left},
		{labels.ItemHeaders[9], 75, gopdf.Left},
		{labels.ItemHeaders[10], 70, gopdf.Right},
		{labels.ItemHeaders[11], 45, gopdf.Center},
	}
	table := newPDFTable(pdf, labels.ItemsSheet, columns)
	if err := table.startSection(); err != nil {
		return err
	}
	for _, row := range rows {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		year := ""
		if row.AcquisitionYear != nil {
			year = fmt.Sprintf("%d", *row.AcquisitionYear)
		}
		value := ""
		if row.EstimatedValue != nil {
			value = formatNumberRU(*row.EstimatedValue, 2)
		}
		if err := table.addRow([]string{
			fmt.Sprintf("%d", row.Number), row.PackageID, row.Name, row.Description,
			fmt.Sprintf("%d", row.Quantity), row.Category, row.Labels, year,
			conditionLabel(labels, row.Condition), row.SerialNumber, value, row.Currency,
		}); err != nil {
			return err
		}
	}
	if len(rows) == 0 {
		return table.addRow([]string{"", "", "—", "", "", "", "", "", "", "", "", ""})
	}
	return nil
}

type pdfColumn struct {
	title string
	width float64
	align int
}

type pdfTable struct {
	pdf        *gopdf.GoPdf
	title      string
	columns    []pdfColumn
	x          float64
	y          float64
	fontSize   float64
	lineHeight float64
}

func newPDFTable(pdf *gopdf.GoPdf, title string, columns []pdfColumn) *pdfTable {
	return &pdfTable{
		pdf: pdf, title: title, columns: columns, x: pdfMargin,
		fontSize: 7.3, lineHeight: 9.2,
	}
}

func (t *pdfTable) startSection() error {
	t.pdf.AddPage()
	t.y = pdfMargin
	if err := t.pdf.SetFont("Go", "B", 14); err != nil {
		return err
	}
	t.pdf.SetXY(t.x, t.y)
	t.pdf.Cell(nil, t.title)
	t.y += 25
	return t.addHeader()
}

func (t *pdfTable) addHeader() error {
	if err := t.pdf.SetFont("Go", "B", 7.2); err != nil {
		return err
	}
	height := 38.0
	x := t.x
	for _, column := range t.columns {
		t.pdf.SetFillColor(52, 78, 115)
		t.pdf.SetStrokeColor(203, 213, 225)
		t.pdf.RectFromUpperLeftWithStyle(x, t.y, column.width, height, "FD")
		t.pdf.SetTextColor(255, 255, 255)
		t.pdf.SetXY(x+2.5, t.y+3)
		if err := t.pdf.MultiCellWithOption(
			&gopdf.Rect{W: column.width - 5, H: height - 6},
			column.title,
			gopdf.CellOption{Align: column.align | gopdf.Middle, CoefLineHeight: 1.05},
		); err != nil {
			return err
		}
		x += column.width
	}
	t.pdf.SetTextColor(17, 24, 39)
	t.y += height
	return nil
}

func (t *pdfTable) addRow(values []string) error {
	height, err := t.rowHeight(values)
	if err != nil {
		return err
	}
	if t.y+height > pdfFooterY-10 {
		t.pdf.AddPage()
		t.y = pdfMargin
		if err := t.addHeader(); err != nil {
			return err
		}
	}
	if err := t.pdf.SetFont("Go", "", t.fontSize); err != nil {
		return err
	}
	x := t.x
	for index, column := range t.columns {
		value := ""
		if index < len(values) {
			value = values[index]
		}
		t.pdf.SetFillColor(255, 255, 255)
		t.pdf.SetStrokeColor(226, 232, 240)
		t.pdf.RectFromUpperLeftWithStyle(x, t.y, column.width, height, "FD")
		if value != "" {
			t.pdf.SetXY(x+2.5, t.y+3)
			if err := t.pdf.MultiCellWithOption(
				&gopdf.Rect{W: column.width - 5, H: height - 6},
				value,
				gopdf.CellOption{Align: column.align | gopdf.Top, CoefLineHeight: 1.05},
			); err != nil {
				return err
			}
		}
		x += column.width
	}
	t.y += height
	return nil
}

func (t *pdfTable) rowHeight(values []string) (float64, error) {
	if err := t.pdf.SetFont("Go", "", t.fontSize); err != nil {
		return 0, err
	}
	lines := 1
	for index, column := range t.columns {
		if index >= len(values) {
			continue
		}
		if values[index] == "" {
			continue
		}
		cellLines := 0
		for _, paragraph := range strings.Split(values[index], "\n") {
			wrapped, err := t.pdf.SplitTextWithWordWrap(paragraph, column.width-6)
			if err != nil {
				return 0, err
			}
			cellLines += max(1, len(wrapped))
		}
		lines = max(lines, cellLines)
	}
	return math.Max(22, float64(lines)*t.lineHeight+7), nil
}
