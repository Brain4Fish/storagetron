package docreport

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/Brain4Fish/storagetron/pkg/model"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func packingRequest() model.CreateDocumentationReportRequest {
	return model.CreateDocumentationReportRequest{
		Scope:  model.DocumentationScope{Type: "containers", ContainerIDs: []uuid.UUID{uuid.New()}},
		Format: "docx", Language: "en",
		Summary: &model.DocumentationSummary{
			OwnerName: "Sender & family", ConsigneeName: "Recipient <name>",
			OriginCountry: "Kazakhstan", OriginAddress: "Almaty\nStreet 1",
			DestinationCountry: "Netherlands", DestinationAddress: "Amsterdam\nStreet 2",
			ShipmentDate: "2026-11-02", Declaration: "My declaration.\nSecond paragraph.\nНастоящим заявляю, что сведения достоверны и полны.",
		},
	}
}

func docxParts(t *testing.T, output []byte) map[string]string {
	t.Helper()
	archive, err := zip.NewReader(bytes.NewReader(output), int64(len(output)))
	require.NoError(t, err)
	parts := make(map[string]string)
	for _, file := range archive.File {
		r, err := file.Open()
		require.NoError(t, err)
		data, err := io.ReadAll(r)
		require.NoError(t, err)
		require.NoError(t, r.Close())
		decoder := xml.NewDecoder(bytes.NewReader(data))
		for {
			_, err := decoder.Token()
			if errors.Is(err, io.EOF) {
				break
			}
			require.NoError(t, err, file.Name)
		}
		parts[file.Name] = string(data)
	}
	return parts
}

type packingTestParagraph struct {
	Properties struct {
		Style struct {
			Value string `xml:"val,attr"`
		} `xml:"pStyle"`
	} `xml:"pPr"`
	Runs []struct {
		Text       string `xml:"t"`
		Properties struct {
			Bold *struct{} `xml:"b"`
		} `xml:"rPr"`
	} `xml:"r"`
}

func (p packingTestParagraph) Text() string {
	var result strings.Builder
	for _, run := range p.Runs {
		result.WriteString(run.Text)
	}
	return result.String()
}

func (p packingTestParagraph) Bold() bool {
	for _, run := range p.Runs {
		if run.Text != "" && run.Properties.Bold != nil {
			return true
		}
	}
	return false
}

func packingCellParagraphs(t *testing.T, content string) []packingTestParagraph {
	t.Helper()
	var cell struct {
		Paragraphs []packingTestParagraph `xml:"p"`
	}
	require.NoError(t, xml.Unmarshal([]byte(`<cell xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`+content+`</cell>`), &cell))
	return cell.Paragraphs
}

func packingCellText(t *testing.T, content string) string {
	t.Helper()
	var text strings.Builder
	for _, paragraph := range packingCellParagraphs(t, content) {
		text.WriteString(paragraph.Text())
		text.WriteString("\n")
	}
	return text.String()
}

func TestDOCXPackingListValuesGroupingAndEscaping(t *testing.T) {
	eur, usd := "EUR", "USD"
	scope := ScopeSnapshot{
		Type: "containers",
		Containers: []ContainerSnapshot{
			{ID: uuid.New(), PackageCode: "BOX-1", Name: "Kitchen utensils", Items: []ItemSnapshot{
				{ID: uuid.New(), Name: "Книги & <books>\x01", Quantity: 3, EstimatedValue: floatPointer(12.34), ValueCurrency: &eur},
				{ID: uuid.New(), Name: "Cable", Description: "Comment with enough words to wrap onto several lines.\nSecond comment.", Quantity: 2, EstimatedValue: floatPointer(1.01), ValueCurrency: &eur},
				{ID: uuid.New(), Name: "Camera", Quantity: 1, EstimatedValue: floatPointer(20), ValueCurrency: &usd},
				{ID: uuid.New(), Name: "Unknown value", Quantity: 1},
			}},
			{ID: uuid.New(), PackageCode: "BOX-2", EstimatedValue: floatPointer(5), ValueCurrency: &eur, Items: []ItemSnapshot{
				{ID: uuid.New(), Name: "Override contents", Quantity: 10, EstimatedValue: floatPointer(999), ValueCurrency: &eur},
			}},
			{ID: uuid.New(), PackageCode: "EMPTY"},
		},
		LooseItems: []ItemSnapshot{{ID: uuid.New(), Name: "Loose zero value", Quantity: 1, EstimatedValue: floatPointer(0), ValueCurrency: &eur}},
	}
	report := PrepareReport(packingRequest(), scope)
	var output bytes.Buffer
	require.NoError(t, NewDOCXRenderer().Render(context.Background(), "en", &output, report))
	parts := docxParts(t, output.Bytes())
	document := parts["word/document.xml"]
	var layout struct {
		Body struct {
			Tables []struct {
				Rows []struct {
					Cells []struct {
						Properties struct {
							Span struct {
								Value int `xml:"val,attr"`
							} `xml:"gridSpan"`
						} `xml:"tcPr"`
						XML string `xml:",innerxml"`
					} `xml:"tc"`
				} `xml:"tr"`
			} `xml:"tbl"`
		} `xml:"body"`
	}
	require.NoError(t, xml.Unmarshal([]byte(document), &layout))
	require.Len(t, layout.Body.Tables, 1)
	rows := layout.Body.Tables[0].Rows
	require.Len(t, rows, 3)
	require.Len(t, rows[0].Cells, 2)
	require.Equal(t, 4, rows[0].Cells[0].Properties.Span.Value)
	require.Equal(t, 4, rows[0].Cells[1].Properties.Span.Value)
	require.Len(t, rows[1].Cells, 8)
	require.Len(t, rows[2].Cells, 8)
	for i := 0; i < 4; i++ {
		require.Equal(t, packingCellText(t, rows[1].Cells[i].XML), packingCellText(t, rows[1].Cells[i+4].XML))
		require.Empty(t, strings.TrimSpace(packingCellText(t, rows[2].Cells[i+4].XML)), "right body half must remain empty")
	}
	bodyText := ""
	lineCount := -1
	for _, cell := range rows[2].Cells[:4] {
		paragraphs := packingCellParagraphs(t, cell.XML)
		if lineCount < 0 {
			lineCount = len(paragraphs)
		}
		require.Len(t, paragraphs, lineCount, "all populated columns must have synchronized lines")
		bodyText += packingCellText(t, cell.XML)
	}
	compact := func(text string) string { return strings.Join(strings.Fields(text), "") }
	itemNumbers := compact(packingCellText(t, rows[2].Cells[0].XML))
	require.Contains(t, itemNumbers, "BAG№1(Kitchenutensils)")
	require.Contains(t, itemNumbers, "BAG№2(BOX-2)")
	require.Contains(t, itemNumbers, "BAG№3(EMPTY)")
	require.Equal(t, 3, strings.Count(itemNumbers, "BAG№"))
	require.Contains(t, itemNumbers, "Unpacked")
	for _, want := range []string{"Книги & <books>", "13.35 EUR", "20.00 USD", "Declared package value for BOX-2", "Not specified", "0.00 EUR", "Unpacked", "No items recorded"} {
		require.Contains(t, compact(bodyText), compact(want))
	}
	// The item and all subtotals share the same description cell, with bold totals.
	descriptions := packingCellParagraphs(t, rows[2].Cells[1].XML)
	var comments []string
	for _, paragraph := range descriptions {
		if strings.HasPrefix(paragraph.Text(), "  ") {
			comments = append(comments, paragraph.Text())
		}
	}
	require.Greater(t, len(comments), 2, "wrapped comment lines must retain their extra indentation")
	require.Equal(t, compact("Comment with enough words to wrap onto several lines. Second comment."), compact(strings.Join(comments, " ")))
	require.Equal(t, 1, strings.Count(compact(packingCellText(t, rows[2].Cells[1].XML)), "Overridecontents"))
	totalStart, gaps := 0, 0
	for index, p := range descriptions {
		if strings.Contains(p.Text(), "Total for") || strings.Contains(p.Text(), "Declared") {
			totalStart++
			require.True(t, p.Bold(), "package totals must be bold within the contents cell")
		}
		if p.Properties.Style.Value == "PackingGap" && (index == 0 || descriptions[index-1].Properties.Style.Value != "PackingGap") {
			blanks := 0
			for j := index; j < len(descriptions) && descriptions[j].Properties.Style.Value == "PackingGap"; j++ {
				blanks++
			}
			if blanks == 3 {
				gaps++
			}
		}
	}
	require.Equal(t, 5, totalStart) // Mixed-currency package, override, empty package, loose items.
	require.Equal(t, 3, gaps)
	require.NotContains(t, document, "\x01")
	require.NotContains(t, document, "Shipment date:")
	require.NotContains(t, document, "Transport order number:")
	require.Contains(t, document, `w:orient="portrait"`)
	require.Contains(t, document, `<w:tblW w:w="10466"`)
	require.Contains(t, document, "Value for customs purposes only: 18.35 EUR")
	require.Contains(t, document, "Value for customs purposes only: 20.00 USD")
	require.Contains(t, document, "Total packages: 3")
	require.Contains(t, document, "My declaration.")
	require.Contains(t, document, "Настоящим заявляю, что сведения достоверны и полны.")
	require.NotContains(t, rows[2].Cells[0].XML, "cantSplit")
	require.Contains(t, parts["word/footer.xml"], "NUMPAGES")
	require.Contains(t, parts["word/_rels/document.xml.rels"], `Target="styles.xml"`)
	require.Contains(t, parts["[Content_Types].xml"], "wordprocessingml.document.main+xml")
}

func TestDOCXEmptyScopeAndOptionalDeclaration(t *testing.T) {
	req := packingRequest()
	req.Summary.Declaration = ""
	var output bytes.Buffer
	require.NoError(t, NewDOCXRenderer().Render(context.Background(), "en", &output, PrepareReport(req, ScopeSnapshot{})))
	document := docxParts(t, output.Bytes())["word/document.xml"]
	require.Contains(t, document, "Total packages: 0")
	require.Contains(t, document, "Value for customs purposes only: Not specified")
	require.NotContains(t, document, "My declaration")
	require.Contains(t, document, "SIGNATURE:")
}

func TestDOCXDeclarationTemplatePagesAndAutomaticValues(t *testing.T) {
	req := packingRequest()
	req.Summary.OwnerName = "Owner <newpage> & family"
	req.Summary.Declaration = strings.Join([]string{
		"Total packages: <total_packages>",
		"Value for customs purposes only: <customs_value>",
		"  English declaration.",
		"DATE: __________",
		"NAME: <owner_name>",
		"  <newpage>  ",
		"Всего мест: <total_packages>",
		"Стоимость только для таможенных целей: <customs_value>",
		"   Русская декларация.",
		"ДАТА: __________",
	}, "\r\n")
	eur, usd := "EUR", "USD"
	scope := ScopeSnapshot{Containers: []ContainerSnapshot{
		{ID: uuid.New(), PackageCode: "BOX-1", EstimatedValue: floatPointer(12.34), ValueCurrency: &eur},
		{ID: uuid.New(), PackageCode: "BOX-2", EstimatedValue: floatPointer(20), ValueCurrency: &usd},
	}}
	var output bytes.Buffer
	require.NoError(t, NewDOCXRenderer().Render(context.Background(), "en", &output, PrepareReport(req, scope)))
	document := docxParts(t, output.Bytes())["word/document.xml"]
	require.Equal(t, 1, strings.Count(document, `w:type="page"`))
	require.Equal(t, 1, strings.Count(document, "Total packages: 2"))
	require.Equal(t, 1, strings.Count(document, "Всего мест: 2"))
	require.Contains(t, document, "Value for customs purposes only: 12.34 EUR; 20.00 USD")
	require.Contains(t, document, "Стоимость только для таможенных целей: 12.34 EUR; 20.00 USD")
	require.Contains(t, document, "NAME: Owner &lt;newpage&gt; &amp; family")
	require.Contains(t, document, `xml:space="preserve">  English declaration.`)
	require.Contains(t, document, `xml:space="preserve">   Русская декларация.`)
	require.Less(t, strings.Index(document, "English declaration."), strings.Index(document, `w:type="page"`))
	require.Less(t, strings.Index(document, `w:type="page"`), strings.Index(document, "Русская декларация."))
	require.NotContains(t, document, "&lt;total_packages&gt;")
	require.NotContains(t, document, "&lt;customs_value&gt;")
	require.NotContains(t, document, "&lt;owner_name&gt;")
	require.NotContains(t, document, "SIGNATURE:", "the template owns the signing fields")
	require.NotContains(t, document, "Values are totals for each item entry")
}

func TestDOCXDeclarationPageMarkerIsOnlyRecognizedOnItsOwnLine(t *testing.T) {
	for _, test := range []struct {
		name, text string
		breaks     int
	}{
		{"standalone", "English\n<newpage>\nРусский", 1},
		{"whitespace and CRLF", "English\r\n \t<newpage> \t\r\nРусский", 1},
		{"multiple", "One\n<newpage>\nTwo\n<newpage>\nThree", 2},
		{"inline literal", "Write <newpage> on its own line", 0},
		{"escaped literal", "\\<newpage>", 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			req := packingRequest()
			req.Summary.Declaration = test.text
			var output bytes.Buffer
			require.NoError(t, NewDOCXRenderer().Render(context.Background(), "en", &output, PrepareReport(req, ScopeSnapshot{})))
			document := docxParts(t, output.Bytes())["word/document.xml"]
			require.Equal(t, test.breaks, strings.Count(document, `w:type="page"`))
			if test.breaks > 0 {
				require.NotContains(t, document, "Total packages:")
			} else {
				require.Contains(t, document, "&lt;newpage&gt;")
				require.Contains(t, document, "Total packages: 0")
			}
		})
	}
}

func TestDOCXServicePersistsAndDownloadsPackingList(t *testing.T) {
	repo := &fakeDocumentationRepository{containerScope: ScopeSnapshot{Type: "containers"}}
	service := NewService(repo, NewFileStore(t.TempDir()), testRenderer{}, testRenderer{}, NewDOCXRenderer())
	req := packingRequest()
	req.Summary.ConsigneeName = "  Recipient  "
	req.Summary.ShipmentDate = ""
	req.Summary.Declaration = "  English declaration.\n<newpage>\n   Русская декларация.  "
	metadata, err := service.Create(context.Background(), req)
	require.NoError(t, err)
	require.Equal(t, "docx", metadata.Format)
	require.Equal(t, "en", metadata.Language)
	require.True(t, strings.HasSuffix(metadata.Filename, ".docx"))
	require.Equal(t, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", metadata.ContentType)
	var stored model.CreateDocumentationReportRequest
	require.NoError(t, json.Unmarshal(repo.records[0].RequestSnapshot, &stored))
	require.Equal(t, "Recipient", stored.Summary.ConsigneeName)
	require.Equal(t, req.Summary.Declaration, stored.Summary.Declaration)
	_, file, _, err := service.Open(context.Background(), metadata.ID)
	require.NoError(t, err)
	defer file.Close()
	data, err := io.ReadAll(file)
	require.NoError(t, err)
	require.NotEmpty(t, docxParts(t, data)["word/document.xml"])
	listed, err := service.List(context.Background())
	require.NoError(t, err)
	require.Len(t, listed, 1)
	require.Equal(t, metadata, listed[0])
}

func TestDOCXValidationAndCancellation(t *testing.T) {
	for _, mutate := range []func(*model.CreateDocumentationReportRequest){
		func(r *model.CreateDocumentationReportRequest) { r.Language = "ru" },
		func(r *model.CreateDocumentationReportRequest) { r.Summary.ConsigneeName = " " },
		func(r *model.CreateDocumentationReportRequest) { r.Summary.OriginAddress = "" },
		func(r *model.CreateDocumentationReportRequest) { r.Summary.DestinationAddress = "" },
		func(r *model.CreateDocumentationReportRequest) { r.Summary.ShipmentDate = "2026-02-30" },
	} {
		req := packingRequest()
		mutate(&req)
		_, err := normalizeAndValidateRequest(req)
		require.True(t, IsValidationError(err))
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	require.ErrorIs(t, NewDOCXRenderer().Render(ctx, "en", io.Discard, PreparedReport{}), context.Canceled)
	require.Error(t, NewDOCXRenderer().Render(context.Background(), "ru", io.Discard, PreparedReport{}))
}
