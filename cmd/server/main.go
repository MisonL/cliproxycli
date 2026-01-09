// Package main provides the entry point for the CLI Proxy API server.
// This server acts as a proxy that provides OpenAI/Gemini/Claude compatible API interfaces
// for CLI models, allowing CLI models to be used with tools and libraries designed for standard AI APIs.
package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/joho/godotenv"
	configaccess "cliproxy/internal/access/config_access"
	"cliproxy/internal/buildinfo"
	"cliproxy/internal/cmd"
	"cliproxy/internal/config"
	"cliproxy/internal/logging"
	"cliproxy/internal/managementasset"
	_ "cliproxy/internal/translator"
	"cliproxy/internal/usage"
	"cliproxy/internal/util"
	sdkAuth "cliproxy/sdk/auth"
	coreauth "cliproxy/sdk/cliproxy/auth"
	log "github.com/sirupsen/logrus"
)

var (
	Version           = "dev"
	Commit            = "none"
	BuildDate         = "unknown"
	DefaultConfigPath = ""
)

// init initializes the shared logger setup.
func init() {
	logging.SetupBaseLogger()
	buildinfo.Version = Version
	buildinfo.Commit = Commit
	buildinfo.BuildDate = BuildDate
}

// setKiroIncognitoMode sets the incognito browser mode for Kiro authentication.
// Kiro defaults to incognito mode for multi-account support.
// Users can explicitly override with --incognito or --no-incognito flags.
func setKiroIncognitoMode(cfg *config.Config, useIncognito, noIncognito bool) {
	if useIncognito {
		cfg.IncognitoBrowser = true
	} else if noIncognito {
		cfg.IncognitoBrowser = false
	} else {
		cfg.IncognitoBrowser = true // Kiro default
	}
}

// main is the entry point of the application.
// It parses command-line flags, loads configuration, and starts the appropriate
// service based on the provided flags (login, codex-login, or server mode).
func main() {
	fmt.Printf("CLIProxyAPI Version: %s, Commit: %s, BuiltAt: %s\n", buildinfo.Version, buildinfo.Commit, buildinfo.BuildDate)

	// Command-line flags to control the application's behavior.
	var login bool
	var codexLogin bool
	var claudeLogin bool
	var qwenLogin bool
	var iflowLogin bool
	var iflowCookie bool
	var noBrowser bool
	var antigravityLogin bool
	var kiroLogin bool
	var kiroGoogleLogin bool
	var kiroAWSLogin bool
	var kiroAWSAuthCode bool
	var kiroImport bool
	var githubCopilotLogin bool
	var projectID string
	var configPath string
	var password string
	var noIncognito bool
	var useIncognito bool
	var vertexImport string

	// Define command-line flags for different operation modes.
	flag.BoolVar(&login, "login", false, "Login Google Account")
	flag.BoolVar(&codexLogin, "codex-login", false, "Login to Codex using OAuth")
	flag.BoolVar(&claudeLogin, "claude-login", false, "Login to Claude using OAuth")
	flag.BoolVar(&qwenLogin, "qwen-login", false, "Login to Qwen using OAuth")
	flag.BoolVar(&iflowLogin, "iflow-login", false, "Login to iFlow using OAuth")
	flag.BoolVar(&iflowCookie, "iflow-cookie", false, "Login to iFlow using Cookie")
	flag.BoolVar(&noBrowser, "no-browser", false, "Don't open browser automatically for OAuth")
	flag.BoolVar(&useIncognito, "incognito", false, "Open browser in incognito/private mode for OAuth (useful for multiple accounts)")
	flag.BoolVar(&noIncognito, "no-incognito", false, "Force disable incognito mode (uses existing browser session)")
	flag.BoolVar(&antigravityLogin, "antigravity-login", false, "Login to Antigravity using OAuth")
	flag.BoolVar(&kiroLogin, "kiro-login", false, "Login to Kiro using Google OAuth")
	flag.BoolVar(&kiroGoogleLogin, "kiro-google-login", false, "Login to Kiro using Google OAuth (same as --kiro-login)")
	flag.BoolVar(&kiroAWSLogin, "kiro-aws-login", false, "Login to Kiro using AWS Builder ID (device code flow)")
	flag.BoolVar(&kiroAWSAuthCode, "kiro-aws-authcode", false, "Login to Kiro using AWS Builder ID (authorization code flow, better UX)")
	flag.BoolVar(&kiroImport, "kiro-import", false, "Import Kiro token from Kiro IDE (~/.aws/sso/cache/kiro-auth-token.json)")
	flag.BoolVar(&githubCopilotLogin, "github-copilot-login", false, "Login to GitHub Copilot using device flow")
	flag.StringVar(&projectID, "project_id", "", "Project ID (Gemini only, not required)")
	flag.StringVar(&configPath, "config", DefaultConfigPath, "Configure File Path")
	flag.StringVar(&vertexImport, "vertex-import", "", "Import Vertex service account key JSON file")
	flag.StringVar(&password, "password", "", "")

	flag.CommandLine.Usage = func() {
		out := flag.CommandLine.Output()
		_, _ = fmt.Fprintf(out, "Usage of %s\n", os.Args[0])
		flag.CommandLine.VisitAll(func(f *flag.Flag) {
			if f.Name == "password" {
				return
			}
			s := fmt.Sprintf("  -%s", f.Name)
			name, unquoteUsage := flag.UnquoteUsage(f)
			if name != "" {
				s += " " + name
			}
			if len(s) <= 4 {
				s += "	"
			} else {
				s += "\n    "
			}
			if unquoteUsage != "" {
				s += unquoteUsage
			}
			if f.DefValue != "" && f.DefValue != "false" && f.DefValue != "0" {
				s += fmt.Sprintf(" (default %s)", f.DefValue)
			}
			_, _ = fmt.Fprint(out, s+"\n")
		})
	}

	// Parse the command-line flags.
	flag.Parse()

	// Core application variables.
	var err error
	var cfg *config.Config

	wd, err := os.Getwd()
	if err != nil {
		log.Errorf("failed to get working directory: %v", err)
		return
	}

	// Load environment variables from .env if present.
	if errLoad := godotenv.Load(filepath.Join(wd, ".env")); errLoad != nil {
		if !errors.Is(errLoad, os.ErrNotExist) {
			log.WithError(errLoad).Warn("failed to load .env file")
		}
	}

	var configFilePath string
	if configPath != "" {
		configFilePath = configPath
		cfg, err = config.LoadConfigOptional(configPath, false)
	} else {
		wd, err = os.Getwd()
		if err != nil {
			log.Errorf("failed to get working directory: %v", err)
			return
		}
		configFilePath = filepath.Join(wd, "config.yaml")
		cfg, err = config.LoadConfigOptional(configFilePath, false)
	}
	if err != nil {
		log.Errorf("failed to load config: %v", err)
		return
	}
	if cfg == nil {
		cfg = &config.Config{}
	}

	usage.SetStatisticsEnabled(cfg.UsageStatisticsEnabled)
	coreauth.SetQuotaCooldownDisabled(cfg.DisableCooling)

	if err = logging.ConfigureLogOutput(cfg); err != nil {
		log.Errorf("failed to configure log output: %v", err)
		return
	}

	log.Infof("CLIProxyAPI Version: %s, Commit: %s, BuiltAt: %s", buildinfo.Version, buildinfo.Commit, buildinfo.BuildDate)

	// Default auth directory for local-only mode.
	if strings.TrimSpace(cfg.AuthDir) == "" {
		cfg.AuthDir = filepath.Join(filepath.Dir(configFilePath), "auths")
	}

	// Set the log level based on the configuration.
	util.SetLogLevel(cfg)

	if resolvedAuthDir, errResolveAuthDir := util.ResolveAuthDir(cfg.AuthDir); errResolveAuthDir != nil {
		log.Errorf("failed to resolve auth directory: %v", errResolveAuthDir)
		return
	} else {
		cfg.AuthDir = resolvedAuthDir
	}
	managementasset.SetCurrentConfig(cfg)

	// Create login options to be used in authentication flows.
	options := &cmd.LoginOptions{
		NoBrowser: noBrowser,
	}

	// ALWAYS use the local file store for authentication persistence.
	// This simplified architecture does not support remote Git/Postgres/S3 stores.
	fileStore := sdkAuth.NewFileTokenStore()
	fileStore.SetBaseDir(cfg.AuthDir)
	sdkAuth.RegisterTokenStore(fileStore)

	// Register built-in access providers before constructing services.
	configaccess.Register()

	// Handle different command modes based on the provided flags.

	if vertexImport != "" {
		// Handle Vertex service account import
		cmd.DoVertexImport(cfg, vertexImport)
	} else if login {
		// Handle Google/Gemini login
		cmd.DoLogin(cfg, projectID, options)
	} else if antigravityLogin {
		// Handle Antigravity login
		cmd.DoAntigravityLogin(cfg, options)
	} else if githubCopilotLogin {
		// Handle GitHub Copilot login
		cmd.DoGitHubCopilotLogin(cfg, options)
	} else if codexLogin {
		// Handle Codex login
		cmd.DoCodexLogin(cfg, options)
	} else if claudeLogin {
		// Handle Claude login
		cmd.DoClaudeLogin(cfg, options)
	} else if qwenLogin {
		cmd.DoQwenLogin(cfg, options)
	} else if iflowLogin {
		cmd.DoIFlowLogin(cfg, options)
	} else if iflowCookie {
		cmd.DoIFlowCookieAuth(cfg, options)
	} else if kiroLogin {
		// For Kiro auth, default to incognito mode for multi-account support
		setKiroIncognitoMode(cfg, useIncognito, noIncognito)
		cmd.DoKiroLogin(cfg, options)
	} else if kiroGoogleLogin {
		// For Kiro auth, default to incognito mode for multi-account support
		setKiroIncognitoMode(cfg, useIncognito, noIncognito)
		cmd.DoKiroGoogleLogin(cfg, options)
	} else if kiroAWSLogin {
		// For Kiro auth, default to incognito mode for multi-account support
		setKiroIncognitoMode(cfg, useIncognito, noIncognito)
		cmd.DoKiroAWSLogin(cfg, options)
	} else if kiroAWSAuthCode {
		// For Kiro auth with authorization code flow (better UX)
		setKiroIncognitoMode(cfg, useIncognito, noIncognito)
		cmd.DoKiroAWSAuthCodeLogin(cfg, options)
	} else if kiroImport {
		cmd.DoKiroImport(cfg, options)
	} else {
		// Start the main proxy service.
		// Note: Auto-updater (StartAutoUpdater) has been removed.
		cmd.StartService(cfg, configFilePath, password)
	}
}
