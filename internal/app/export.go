package app

import (
	"fmt"
	"os"
	"strings"
)

func ExportMarkdown(rootPath, outFile string, opts ScanOptions) error {
	root, err := ScanDirectory(rootPath, opts)
	if err != nil {
		return err
	}
	var b strings.Builder
	b.WriteString("# ")
	b.WriteString(escapeMD(root.Name))
	b.WriteString("\n")
	for _, c := range root.Children {
		writeNode(&b, c, 0)
	}
	return os.WriteFile(outFile, []byte(b.String()), 0o644)
}

func writeNode(b *strings.Builder, n *TreeNode, depth int) {
	indent := strings.Repeat("  ", depth)
	b.WriteString(fmt.Sprintf("%s- %s\n", indent, escapeMD(n.Name)))
	for _, c := range n.Children {
		writeNode(b, c, depth+1)
	}
}

func escapeMD(s string) string {
	replacer := strings.NewReplacer("[", "\\[", "]", "\\]", "(", "\\(", ")", "\\)", "#", "\\#", "*", "\\*")
	return replacer.Replace(s)
}
