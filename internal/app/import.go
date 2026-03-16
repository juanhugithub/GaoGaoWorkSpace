package app

import (
	"bufio"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

func BuildPlan(mdFile, targetRoot string, createFiles bool) (*CreatePlan, error) {
	parsed, err := parseMarkdown(mdFile)
	if err != nil {
		return nil, err
	}
	if len(parsed) == 0 {
		return nil, errors.New("no nodes parsed from markdown")
	}

	plan := &CreatePlan{TargetRoot: targetRoot}
	for _, n := range parsed {
		buildPlanNode(plan, n, targetRoot, createFiles)
	}
	plan.Summary.Total = len(plan.Items)
	return plan, nil
}

func ApplyPlan(mdFile, targetRoot string, createFiles bool) (*ApplyResult, error) {
	plan, err := BuildPlan(mdFile, targetRoot, createFiles)
	if err != nil {
		return nil, err
	}
	res := &ApplyResult{}
	for _, item := range plan.Items {
		switch item.Action {
		case PlanCreate:
			if item.Type == NodeDirectory {
				if err := os.MkdirAll(item.Path, 0o755); err != nil {
					res.Failed++
					continue
				}
				res.Created++
			} else {
				f, err := os.OpenFile(item.Path, os.O_CREATE|os.O_EXCL, 0o644)
				if err != nil {
					res.Failed++
					continue
				}
				_ = f.Close()
				res.Created++
			}
		default:
			res.Skipped++
		}
	}
	return res, nil
}

type mdNode struct {
	name     string
	depth    int
	nodeType NodeType
	children []*mdNode
}

func parseMarkdown(mdFile string) ([]*mdNode, error) {
	f, err := os.Open(mdFile)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	var stack []*mdNode
	var roots []*mdNode
	for scanner.Scan() {
		line := strings.TrimRight(scanner.Text(), " \t")
		if strings.TrimSpace(line) == "" {
			continue
		}
		if strings.HasPrefix(line, "# ") {
			continue
		}
		trimLeft := len(line) - len(strings.TrimLeft(line, " "))
		if !strings.Contains(strings.TrimSpace(line), "- ") && !strings.HasPrefix(strings.TrimSpace(line), "-") {
			continue
		}
		depth := trimLeft / 2
		content := strings.TrimSpace(line)
		content = strings.TrimPrefix(content, "- ")
		content = strings.TrimPrefix(content, "-")
		content = strings.TrimSpace(content)
		if content == "" {
			continue
		}

		n := &mdNode{name: content, depth: depth, nodeType: inferType(content)}
		for len(stack) > 0 && stack[len(stack)-1].depth >= depth {
			stack = stack[:len(stack)-1]
		}
		if len(stack) == 0 {
			roots = append(roots, n)
		} else {
			p := stack[len(stack)-1]
			p.children = append(p.children, n)
		}
		stack = append(stack, n)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return roots, nil
}

func inferType(name string) NodeType {
	base := filepath.Base(name)
	if strings.Contains(base, ".") {
		ext := filepath.Ext(base)
		if len(ext) > 1 {
			return NodeFile
		}
	}
	return NodeDirectory
}

func buildPlanNode(plan *CreatePlan, n *mdNode, currentRoot string, createFiles bool) {
	full := filepath.Join(currentRoot, n.name)
	if isDangerousPath(full) {
		plan.Items = append(plan.Items, CreatePlanItem{Path: full, Type: n.nodeType, Action: PlanWarning, Reason: "dangerous target path"})
		plan.Summary.WarningCount++
		return
	}
	if exists(full) {
		plan.Items = append(plan.Items, CreatePlanItem{Path: full, Type: n.nodeType, Action: PlanSkip, Reason: "already exists"})
		plan.Summary.SkipCount++
	} else {
		if n.nodeType == NodeFile && !createFiles {
			plan.Items = append(plan.Items, CreatePlanItem{Path: full, Type: n.nodeType, Action: PlanSkip, Reason: "file creation disabled"})
			plan.Summary.SkipCount++
		} else {
			plan.Items = append(plan.Items, CreatePlanItem{Path: full, Type: n.nodeType, Action: PlanCreate})
			plan.Summary.CreateCount++
		}
	}
	for _, c := range n.children {
		buildPlanNode(plan, c, full, createFiles)
	}
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func isDangerousPath(path string) bool {
	clean := strings.ToLower(filepath.Clean(path))
	dangerous := []string{"/bin", "/usr", "/system", "c:\\windows", "c:\\program files"}
	for _, d := range dangerous {
		if clean == d || strings.HasPrefix(clean, d+string(filepath.Separator)) {
			return true
		}
	}
	return false
}
