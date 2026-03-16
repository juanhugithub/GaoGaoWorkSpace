package app

type NodeType string

const (
	NodeDirectory NodeType = "directory"
	NodeFile      NodeType = "file"
)

type TreeNode struct {
	Name     string
	Path     string
	Type     NodeType
	MTime    int64
	Depth    int
	Children []*TreeNode
}

type ScanOptions struct {
	IncludeFiles bool
	MaxDepth     int
	IgnoreRules  []string
}

type PlanAction string

const (
	PlanCreate  PlanAction = "create"
	PlanSkip    PlanAction = "skip_exists"
	PlanWarning PlanAction = "warning"
	PlanInvalid PlanAction = "skip_invalid"
)

type CreatePlanItem struct {
	Path   string
	Type   NodeType
	Action PlanAction
	Reason string
}

type CreatePlan struct {
	TargetRoot string
	Summary    struct {
		Total        int
		CreateCount  int
		SkipCount    int
		WarningCount int
	}
	Items []CreatePlanItem
}

type ApplyResult struct {
	Created int
	Skipped int
	Failed  int
}
