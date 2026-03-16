package app

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func ScanDirectory(root string, opts ScanOptions) (*TreeNode, error) {
	root = filepath.Clean(root)
	info, err := os.Stat(root)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, os.ErrInvalid
	}

	return scanNode(root, 0, opts)
}

func scanNode(path string, depth int, opts ScanOptions) (*TreeNode, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	node := &TreeNode{
		Name:  info.Name(),
		Path:  path,
		Type:  NodeDirectory,
		MTime: info.ModTime().Unix(),
		Depth: depth,
	}
	if depth == 0 && info.Name() == "." {
		node.Name = filepath.Base(path)
	}

	if opts.MaxDepth >= 0 && depth >= opts.MaxDepth {
		return node, nil
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}

	children := make([]*TreeNode, 0, len(entries))
	for _, e := range entries {
		name := e.Name()
		full := filepath.Join(path, name)
		if shouldIgnore(full, name, opts.IgnoreRules) {
			continue
		}
		if e.IsDir() {
			child, err := scanNode(full, depth+1, opts)
			if err != nil {
				continue
			}
			children = append(children, child)
			continue
		}
		if opts.IncludeFiles {
			fi, err := e.Info()
			if err != nil {
				continue
			}
			children = append(children, &TreeNode{
				Name:  name,
				Path:  full,
				Type:  NodeFile,
				MTime: fi.ModTime().Unix(),
				Depth: depth + 1,
			})
		}
	}

	sort.Slice(children, func(i, j int) bool {
		if children[i].Type != children[j].Type {
			return children[i].Type == NodeDirectory
		}
		return strings.ToLower(children[i].Name) < strings.ToLower(children[j].Name)
	})

	node.Children = children
	return node, nil
}

func shouldIgnore(fullPath, name string, rules []string) bool {
	base := strings.ToLower(name)
	defaults := []string{".ds_store", "thumbs.db", "desktop.ini", "~$", ".git", "node_modules"}
	for _, d := range defaults {
		if strings.Contains(base, d) {
			return true
		}
	}
	for _, r := range rules {
		r = strings.TrimSpace(strings.ToLower(r))
		if r == "" {
			continue
		}
		if ok, _ := filepath.Match(r, base); ok {
			return true
		}
		if strings.Contains(strings.ToLower(fullPath), r) {
			return true
		}
	}
	return false
}

func CountNodes(root *TreeNode) int {
	if root == nil {
		return 0
	}
	n := 1
	for _, c := range root.Children {
		n += CountNodes(c)
	}
	return n
}
