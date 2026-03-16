package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gaogao-workbench/internal/app"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	cmd := os.Args[1]
	switch cmd {
	case "scan":
		runScan(os.Args[2:])
	case "export":
		runExport(os.Args[2:])
	case "import-plan":
		runImportPlan(os.Args[2:])
	case "import-apply":
		runImportApply(os.Args[2:])
	case "version":
		fmt.Println("gaogao-workbench v0.1.0")
	default:
		fmt.Printf("unknown command: %s\n", cmd)
		printUsage()
		os.Exit(1)
	}
}

func runScan(args []string) {
	fs := flag.NewFlagSet("scan", flag.ExitOnError)
	root := fs.String("root", "", "root directory")
	includeFiles := fs.Bool("include-files", true, "include files")
	maxDepth := fs.Int("max-depth", -1, "max depth, -1 means unlimited")
	ignore := fs.String("ignore", "", "comma-separated ignore patterns")
	_ = fs.Parse(args)

	if *root == "" {
		exitErr(errors.New("-root is required"))
	}

	nodes, err := app.ScanDirectory(*root, app.ScanOptions{
		IncludeFiles: *includeFiles,
		MaxDepth:     *maxDepth,
		IgnoreRules:  splitCSV(*ignore),
	})
	if err != nil {
		exitErr(err)
	}

	fmt.Printf("Scanned: %s\n", *root)
	fmt.Printf("Total nodes: %d\n", app.CountNodes(nodes))
}

func runExport(args []string) {
	fs := flag.NewFlagSet("export", flag.ExitOnError)
	root := fs.String("root", "", "root directory")
	out := fs.String("out", "", "output markdown file")
	includeFiles := fs.Bool("include-files", true, "include files")
	maxDepth := fs.Int("max-depth", -1, "max depth")
	ignore := fs.String("ignore", "", "comma-separated ignore patterns")
	_ = fs.Parse(args)

	if *root == "" || *out == "" {
		exitErr(errors.New("-root and -out are required"))
	}

	err := app.ExportMarkdown(*root, *out, app.ScanOptions{
		IncludeFiles: *includeFiles,
		MaxDepth:     *maxDepth,
		IgnoreRules:  splitCSV(*ignore),
	})
	if err != nil {
		exitErr(err)
	}
	fmt.Printf("Exported markdown to: %s\n", *out)
}

func runImportPlan(args []string) {
	fs := flag.NewFlagSet("import-plan", flag.ExitOnError)
	mdFile := fs.String("md", "", "input markdown file")
	target := fs.String("target", "", "target root directory")
	createFiles := fs.Bool("create-files", false, "create file nodes as empty files")
	_ = fs.Parse(args)

	if *mdFile == "" || *target == "" {
		exitErr(errors.New("-md and -target are required"))
	}

	plan, err := app.BuildPlan(*mdFile, *target, *createFiles)
	if err != nil {
		exitErr(err)
	}

	fmt.Printf("Target: %s\n", plan.TargetRoot)
	fmt.Printf("Summary: total=%d create=%d skip=%d warning=%d\n",
		plan.Summary.Total, plan.Summary.CreateCount, plan.Summary.SkipCount, plan.Summary.WarningCount)
	for _, item := range plan.Items {
		fmt.Printf("- [%s] %s (%s)", strings.ToUpper(string(item.Action)), item.Path, item.Type)
		if item.Reason != "" {
			fmt.Printf(" reason=%s", item.Reason)
		}
		fmt.Println()
	}
}

func runImportApply(args []string) {
	fs := flag.NewFlagSet("import-apply", flag.ExitOnError)
	mdFile := fs.String("md", "", "input markdown file")
	target := fs.String("target", "", "target root directory")
	createFiles := fs.Bool("create-files", false, "create file nodes as empty files")
	confirm := fs.String("confirm", "", "must equal APPLY")
	_ = fs.Parse(args)

	if *confirm != "APPLY" {
		exitErr(errors.New("dangerous action requires -confirm APPLY"))
	}

	if *mdFile == "" || *target == "" {
		exitErr(errors.New("-md and -target are required"))
	}

	result, err := app.ApplyPlan(*mdFile, filepath.Clean(*target), *createFiles)
	if err != nil {
		exitErr(err)
	}
	fmt.Printf("Applied: created=%d skipped=%d failed=%d\n", result.Created, result.Skipped, result.Failed)
}

func splitCSV(v string) []string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func printUsage() {
	fmt.Println(`gaogao-workbench CLI

Commands:
  scan -root <dir> [-include-files=true] [-max-depth=-1] [-ignore=.git,node_modules]
  export -root <dir> -out <file.md> [-include-files=true] [-max-depth=-1] [-ignore=...]
  import-plan -md <file.md> -target <dir> [-create-files=false]
  import-apply -md <file.md> -target <dir> [-create-files=false] -confirm APPLY
  version`)
	fmt.Println("Tip: this executable is intended for V1 core workflow testing.")
	fmt.Println("Build: GOOS=windows GOARCH=amd64 go build -o dist/gaogao-workbench.exe ./cmd/gaogao")
	fmt.Println("Env:" + strconv.Quote(os.Getenv("GOOS")))
}

func exitErr(err error) {
	fmt.Fprintf(os.Stderr, "Error: %v\n", err)
	os.Exit(1)
}
