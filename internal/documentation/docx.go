package docreport

import (
	"archive/zip"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"

	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/font/opentype"
)

// DOCXRenderer writes an editable packing list without an Office installation.
// Item values are line totals, matching the existing inventory report semantics.
type DOCXRenderer struct{}

func NewDOCXRenderer() *DOCXRenderer { return &DOCXRenderer{} }

func (r *DOCXRenderer) Render(ctx context.Context, locale string, writer io.Writer, report PreparedReport) error {
	if locale != "en" {
		return fmt.Errorf("unsupported packing list locale %q", locale)
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	summary := report.Request.Summary
	var body strings.Builder
	body.WriteString(docxParagraph("PACKING LIST / INVOICE", "Title", true))
	if summary.Carrier != "" {
		body.WriteString(docxParagraph("Carrier: "+summary.Carrier, "", false))
	}
	table, err := packingTable(ctx, report)
	if err != nil {
		return err
	}
	body.WriteString(table)
	if packingDeclarationTemplate(summary.Declaration) {
		body.WriteString(renderPackingDeclaration(report))
	} else {
		// Keep the automatic summary/signing fields for existing plain declarations.
		body.WriteString(packingLegacySummary(report))
		body.WriteString(renderPackingDeclaration(report))
		body.WriteString(docxParagraph("DATE: ____________________    NAME: "+summary.OwnerName, "SignatureDate", false))
		body.WriteString(docxParagraph("SIGNATURE: ________________________________________", "", false))
	}

	document := docxXMLHeader + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>` + body.String() + `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360"/></w:sectPr></w:body></w:document>`
	files := []struct{ name, content string }{
		{"[Content_Types].xml", docxContentTypes},
		{"_rels/.rels", docxRootRels},
		{"word/document.xml", document},
		{"word/_rels/document.xml.rels", docxDocumentRels},
		{"word/styles.xml", docxStyles},
		{"word/footer.xml", docxFooter},
	}
	archive := zip.NewWriter(writer)
	for _, file := range files {
		if err := ctx.Err(); err != nil {
			return err
		}
		part, err := archive.Create(file.name)
		if err != nil {
			return fmt.Errorf("create DOCX part: %w", err)
		}
		if _, err := io.WriteString(part, file.content); err != nil {
			return fmt.Errorf("write DOCX part: %w", err)
		}
	}
	return archive.Close()
}

func packingDeclarationTemplate(declaration string) bool {
	for _, token := range []string{"<total_packages>", "<customs_value>", "<owner_name>"} {
		if strings.Contains(declaration, token) {
			return true
		}
	}
	for _, line := range strings.Split(declaration, "\n") {
		if strings.TrimSpace(line) == "<newpage>" {
			return true
		}
	}
	return false
}

func renderPackingDeclaration(report PreparedReport) string {
	if report.Request.Summary.Declaration == "" {
		return ""
	}
	var values []string
	for _, total := range report.CurrencyTotals {
		values = append(values, packingAmount(total)+" "+total.Currency)
	}
	value := strings.Join(values, "; ")
	if value == "" {
		value = "—"
	}
	replace := strings.NewReplacer(
		"<total_packages>", strconv.Itoa(report.PackageCount),
		"<customs_value>", value,
		"<owner_name>", report.Request.Summary.OwnerName,
	)
	var body strings.Builder
	for _, line := range strings.Split(strings.ReplaceAll(report.Request.Summary.Declaration, "\r\n", "\n"), "\n") {
		if strings.TrimSpace(line) == "<newpage>" {
			body.WriteString(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`)
			continue
		}
		bold := strings.Contains(line, "<total_packages>") || strings.Contains(line, "<customs_value>")
		body.WriteString(docxParagraph(replace.Replace(line), "", bold))
	}
	return body.String()
}

func packingLegacySummary(report PreparedReport) string {
	var body strings.Builder
	body.WriteString(docxParagraph(fmt.Sprintf("Total packages: %d", report.PackageCount), "", true))
	if len(report.CurrencyTotals) == 0 {
		body.WriteString(docxParagraph("Value for customs purposes only: Not specified", "", true))
	}
	for _, total := range report.CurrencyTotals {
		body.WriteString(docxParagraph("Value for customs purposes only: "+packingAmount(total)+" "+total.Currency, "", true))
	}
	body.WriteString(docxParagraph("Values are totals for each item entry, not unit prices. Totals include stated values only; currencies are not converted. Declared package values replace item values in the overall totals.", "", false))
	if len(report.Scope.LooseItems) > 0 {
		body.WriteString(docxParagraph("Unpacked items are included in the value totals but not in the package count.", "", false))
	}
	return body.String()
}

func packingItemTotals(items []ItemSnapshot) []MoneyTotal {
	amounts := make(map[string]int64)
	for _, item := range items {
		if item.EstimatedValue != nil && item.ValueCurrency != nil {
			amounts[*item.ValueCurrency] += moneyMinor(*item.EstimatedValue)
		}
	}
	totals := make([]MoneyTotal, 0, len(amounts))
	for currency, amount := range amounts {
		totals = append(totals, MoneyTotal{Currency: currency, MinorUnits: amount})
	}
	sort.Slice(totals, func(i, j int) bool { return totals[i].Currency < totals[j].Currency })
	return totals
}

func packingAmount(total MoneyTotal) string {
	return strconv.FormatInt(total.MinorUnits/100, 10) + "." + fmt.Sprintf("%02d", total.MinorUnits%100)
}

// The sample has one continuous body row, with four populated columns and four
// empty columns. Synchronize explicitly wrapped lines so quantities and values
// stay beside their descriptions without introducing item or package cells.
type packingLine struct {
	text string
	bold bool
	gap  bool
}

func packingTable(ctx context.Context, report PreparedReport) (string, error) {
	widths := []int{1100, 2450, 500, 1183, 1100, 2450, 500, 1183}
	commonCurrency := packingCurrency(report.Scope)
	faces := make([]font.Face, 2)
	for index, data := range [][]byte{goregular.TTF, gobold.TTF} {
		parsed, err := opentype.Parse(data)
		if err != nil {
			return "", err
		}
		face, err := opentype.NewFace(parsed, &opentype.FaceOptions{Size: 10, DPI: 72, Hinting: font.HintingNone})
		if err != nil {
			return "", err
		}
		defer face.Close()
		faces[index] = face
	}
	var columns [4][]packingLine
	appendBlock := func(values [4]string, bold bool) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		var wrapped [4][]string
		height := 1
		for index, value := range values {
			face := faces[0]
			if bold || index == 0 {
				face = faces[1]
			}
			// Include a guard for differences between Go's metrics and Word's Arial.
			available := float64(widths[index])/20 - 14
			if index == 0 {
				available += 4
			}
			if index == 1 {
				available -= 12 // Preserve the requested description indentation.
			}
			wrapped[index] = packingWrap(value, face, available)
			height = max(height, len(wrapped[index]))
		}
		for index := range columns {
			for line := 0; line < height; line++ {
				text := ""
				if line < len(wrapped[index]) {
					text = wrapped[index][line]
				}
				columns[index] = append(columns[index], packingLine{text: text, bold: bold || index == 0})
			}
		}
		return nil
	}
	groups := append([]ContainerSnapshot(nil), report.Scope.Containers...)
	if len(report.Scope.LooseItems) > 0 {
		groups = append(groups, ContainerSnapshot{PackageCode: "Unpacked", Items: report.Scope.LooseItems})
	}
	for groupIndex, group := range groups {
		if groupIndex > 0 {
			for index := range columns {
				columns[index] = append(columns[index], packingLine{gap: true}, packingLine{gap: true}, packingLine{gap: true})
			}
		}
		packageID := group.PackageID()
		columnLabel := packageID
		if groupIndex < len(report.Scope.Containers) {
			name := strings.TrimSpace(group.Name)
			if name == "" {
				name = packageID
			}
			columnLabel = fmt.Sprintf("BAG №%d (%s)", groupIndex+1, name)
		}
		if len(group.Items) == 0 {
			text := "No items recorded"
			if group.Description != "" {
				text += "\n" + group.Description
			}
			if err := appendBlock([4]string{columnLabel, text, "", ""}, false); err != nil {
				return "", err
			}
		}
		for index, item := range group.Items {
			label := ""
			if index == 0 {
				label = columnLabel
			}
			description := "• " + item.Name
			if item.Description != "" {
				comment := strings.ReplaceAll(item.Description, "\r\n", "\n")
				description += "\n  " + strings.ReplaceAll(comment, "\n", "\n  ")
			}
			value := "Not specified"
			if item.EstimatedValue != nil && item.ValueCurrency != nil {
				value = packingAmount(MoneyTotal{MinorUnits: moneyMinor(*item.EstimatedValue)})
				if commonCurrency == "" {
					value += " " + *item.ValueCurrency
				}
			}
			if err := appendBlock([4]string{label, description, strconv.Itoa(item.Quantity), value}, false); err != nil {
				return "", err
			}
		}
		totals, label := packingItemTotals(group.Items), "Total for "+packageID
		if group.EstimatedValue != nil && group.ValueCurrency != nil {
			totals = []MoneyTotal{{Currency: *group.ValueCurrency, MinorUnits: moneyMinor(*group.EstimatedValue)}}
			label = "Declared package value for " + packageID
		}
		if len(totals) == 0 {
			if err := appendBlock([4]string{"", label, "", "Not specified"}, true); err != nil {
				return "", err
			}
		}
		for _, total := range totals {
			if err := appendBlock([4]string{"", label, "", packingAmount(total) + " " + total.Currency}, true); err != nil {
				return "", err
			}
		}
	}
	if len(groups) == 0 {
		if err := appendBlock([4]string{"", "No items recorded", "", ""}, false); err != nil {
			return "", err
		}
	}
	var table strings.Builder
	table.WriteString(docxTableStart(widths))
	table.WriteString(`<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="1535"/></w:trPr>`)
	summary := report.Request.Summary
	for _, party := range []string{
		"NAME & ADDRESS / Shipper:\n" + summary.OwnerName + "\n" + summary.OriginAddress + "\n" + summary.OriginCountry,
		"NAME & ADDRESS / Consignee:\n" + summary.ConsigneeName + "\n" + summary.DestinationAddress + "\n" + summary.DestinationCountry,
	} {
		table.WriteString(packingCell(docxParagraph(party, "PackingParty", true), 5233, 4))
	}
	table.WriteString(`</w:tr><w:tr><w:trPr><w:cantSplit/></w:trPr>`)
	valueHeading := "VALUE/PRICE"
	if commonCurrency != "" {
		valueHeading += "\n" + commonCurrency
	}
	for index, heading := range []string{"ITEM\nNO", "DESCRIPTION OF GOODS", "PCS", valueHeading, "ITEM\nNO", "DESCRIPTION OF GOODS", "PCS", valueHeading} {
		table.WriteString(packingCell(docxParagraph(heading, "PackingHeader", true), widths[index], 1))
	}
	// This final row must be allowed to split across pages.
	table.WriteString(`</w:tr><w:tr>`)
	for index, width := range widths {
		var content strings.Builder
		if index < 4 {
			for _, line := range columns[index] {
				style := "PackingLine"
				if index == 1 {
					style = "PackingDescription"
				} else if index == 0 {
					style = "PackingPackage"
				} else {
					style = "PackingNumber"
				}
				if line.gap {
					style = "PackingGap"
				}
				content.WriteString(docxParagraph(line.text, style, line.bold))
			}
		} else {
			content.WriteString(docxParagraph("", "PackingLine", false))
		}
		table.WriteString(packingCell(content.String(), width, 1))
	}
	table.WriteString(`</w:tr></w:tbl>`)
	return table.String(), nil
}

func packingCurrency(scope ScopeSnapshot) string {
	currencies := make(map[string]bool)
	addItems := func(items []ItemSnapshot) {
		for _, item := range items {
			if item.EstimatedValue != nil && item.ValueCurrency != nil {
				currencies[*item.ValueCurrency] = true
			}
		}
	}
	for _, container := range scope.Containers {
		if container.EstimatedValue != nil && container.ValueCurrency != nil {
			currencies[*container.ValueCurrency] = true
		}
		addItems(container.Items)
	}
	addItems(scope.LooseItems)
	if len(currencies) == 1 {
		for currency := range currencies {
			return currency
		}
	}
	return ""
}

func packingWrap(text string, face font.Face, width float64) []string {
	var lines []string
	for _, paragraph := range strings.Split(strings.ReplaceAll(cleanDocxText(text), "\r\n", "\n"), "\n") {
		prefix := paragraph[:len(paragraph)-len(strings.TrimLeft(paragraph, " "))]
		available := width - float64(font.MeasureString(face, prefix))/64
		line := ""
		for _, word := range strings.Fields(paragraph) {
			candidate := word
			if line != "" {
				candidate = line + " " + word
			}
			if float64(font.MeasureString(face, candidate))/64 <= available {
				line = candidate
				continue
			}
			if line != "" {
				lines = append(lines, prefix+line)
				line = ""
			}
			for _, character := range word {
				candidate = line + string(character)
				if line != "" && float64(font.MeasureString(face, candidate))/64 > available {
					lines = append(lines, prefix+line)
					line = ""
				}
				line += string(character)
			}
		}
		lines = append(lines, prefix+line)
	}
	return lines
}

func docxText(value string) string {
	var escaped strings.Builder
	_ = xml.EscapeText(&escaped, []byte(cleanDocxText(value)))
	return escaped.String()
}

func cleanDocxText(value string) string {
	// Inventory descriptions may contain controls that XML 1.0 cannot represent.
	return strings.Map(func(r rune) rune {
		if r == '\t' || r == '\n' || r == '\r' || r >= 0x20 && r <= 0xD7FF || r >= 0xE000 && r <= 0xFFFD || r >= 0x10000 && r <= 0x10FFFF {
			return r
		}
		return -1
	}, value)
}

func docxParagraph(text, style string, bold bool) string {
	properties := `<w:spacing w:after="120"/>`
	if style != "" {
		properties = `<w:pStyle w:val="` + style + `"/>`
	}
	runProperties := ""
	if bold {
		runProperties = `<w:rPr><w:b/></w:rPr>`
	}
	var runs strings.Builder
	for index, line := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		if index > 0 {
			runs.WriteString(`<w:r><w:br/></w:r>`)
		}
		runs.WriteString(`<w:r>` + runProperties + `<w:t xml:space="preserve">` + docxText(line) + `</w:t></w:r>`)
	}
	return `<w:p><w:pPr>` + properties + `</w:pPr>` + runs.String() + `</w:p>`
}

func docxTableStart(widths []int) string {
	var grid strings.Builder
	totalWidth := 0
	for _, width := range widths {
		fmt.Fprintf(&grid, `<w:gridCol w:w="%d"/>`, width)
		totalWidth += width
	}
	return `<w:tbl><w:tblPr><w:tblW w:w="` + strconv.Itoa(totalWidth) + `" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>` + grid.String() + `</w:tblGrid>`
}

func packingCell(content string, width, span int) string {
	properties := fmt.Sprintf(`<w:tcW w:w="%d" w:type="dxa"/>`, width)
	if span > 1 {
		properties += fmt.Sprintf(`<w:gridSpan w:val="%d"/>`, span)
	}
	return `<w:tc><w:tcPr>` + properties + `<w:vAlign w:val="top"/></w:tcPr>` + content + `</w:tc>`
}

const docxXMLHeader = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`

const docxContentTypes = docxXMLHeader + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`

const docxRootRels = docxXMLHeader + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDocument" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`

const docxDocumentRels = docxXMLHeader + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer.xml"/></Relationships>`

const docxStyles = docxXMLHeader + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="000000"/><w:sz w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="SignatureDate"><w:name w:val="Signature date"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="PackingParty"><w:name w:val="Packing party"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="PackingHeader"><w:name w:val="Packing header"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="PackingLine"><w:name w:val="Packing line"/><w:basedOn w:val="Normal"/><w:pPr><w:widowControl w:val="0"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="exact"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="PackingDescription"><w:name w:val="Packing description"/><w:basedOn w:val="PackingLine"/><w:pPr><w:ind w:left="240"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="PackingGap"><w:name w:val="Packing gap"/><w:basedOn w:val="PackingLine"/></w:style>
  <w:style w:type="paragraph" w:styleId="PackingPackage"><w:name w:val="Packing package"/><w:basedOn w:val="PackingLine"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="PackingNumber"><w:name w:val="Packing number"/><w:basedOn w:val="PackingLine"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>
</w:styles>`

const docxFooter = docxXMLHeader + `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t xml:space="preserve">Page </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve"> of </w:t></w:r><w:fldSimple w:instr="NUMPAGES"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`
