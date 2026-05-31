package main

import (
	"context"
	"crypto/tls"
	"io/ioutil"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

var defaultCIDRs = []string{
	"185.143.232.0/22",
	"188.229.116.16/30",
	"94.101.182.0/27",
	"2.144.3.128/28",
	"37.32.16.0/27",
	"37.32.17.0/27",
	"37.32.18.0/27",
	"37.32.19.0/27",
	"185.215.232.0/22",
	"178.131.120.48/28",
	"94.101.183.0/28",
	"78.157.36.112/28",
}

func (a *App) GetConfig() map[string]interface{} {
	return map[string]interface{}{
		"cidrs": defaultCIDRs,
	}
}

func (a *App) FetchArvanIPs() []string {
	client := http.Client{
		Timeout: 5 * time.Second,
	}
	resp, err := client.Get("https://www.arvancloud.ir/fa/ips.txt")
	if err != nil {
		return defaultCIDRs
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return defaultCIDRs
	}

	lines := strings.Split(string(body), "\n")
	var cidrs []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			cidrs = append(cidrs, line)
		}
	}
	
	if len(cidrs) > 0 {
		return cidrs
	}
	return defaultCIDRs
}

type ScanRequest struct {
	CIDRs       []string `json:"cidrs"`
	Concurrency int      `json:"concurrency"`
	Mode        string   `json:"mode"`
	SNI         string   `json:"sni"`
}

type Progress struct {
	Tested int `json:"tested"`
	Total  int `json:"total"`
}

type Result struct {
	IP      string `json:"ip"`
	Latency int64  `json:"latency"`
	Jitter  int64  `json:"jitter"`
}

var (
	scanMutex  sync.Mutex
	cancelScan context.CancelFunc
)

func (a *App) StartScan(req ScanRequest) {
	go a.runScan(req)
}

func (a *App) StopScan() {
	if cancelScan != nil {
		cancelScan()
	}
}

func (a *App) runScan(req ScanRequest) {
	if !scanMutex.TryLock() {
		return
	}
	defer scanMutex.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	cancelScan = cancel
	defer cancel()

	runtime.EventsEmit(a.ctx, "scan_start")

	var allIPs []string
	for _, cidr := range req.CIDRs {
		ips, err := getIPsFromCIDR(cidr)
		if err == nil {
			allIPs = append(allIPs, ips...)
		}
	}
	total := len(allIPs)
	tested := 0
	var clientsMutex sync.Mutex
	ipChan := make(chan string, total)
	for _, ip := range allIPs {
		ipChan <- ip
	}
	close(ipChan)

	var wg sync.WaitGroup
	timeout := 2 * time.Second

	for i := 0; i < req.Concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for ip := range ipChan {
				select {
				case <-ctx.Done():
					return
				default:
				}

				addr := net.JoinHostPort(ip, "443")

				var latencies []int64
				var connErr error

				for test := 0; test < 3; test++ {
					start := time.Now()
					if req.Mode == "tls" {
						conn, err := tls.DialWithDialer(&net.Dialer{Timeout: timeout}, "tcp", addr, &tls.Config{
							ServerName:         req.SNI,
							InsecureSkipVerify: true,
						})
						connErr = err
						if err == nil {
							latencies = append(latencies, time.Since(start).Milliseconds())
							conn.Close()
						} else {
							break
						}
					} else {
						conn, err := net.DialTimeout("tcp", addr, timeout)
						connErr = err
						if err == nil {
							latencies = append(latencies, time.Since(start).Milliseconds())
							conn.Close()
						} else {
							break
						}
					}
				}

				if connErr == nil && len(latencies) > 0 {
					var sum int64
					for _, l := range latencies {
						sum += l
					}
					avgLatency := sum / int64(len(latencies))

					var jitter int64
					if len(latencies) > 1 {
						var jitterSum int64
						for i := 1; i < len(latencies); i++ {
							diff := latencies[i] - latencies[i-1]
							if diff < 0 {
								diff = -diff
							}
							jitterSum += diff
						}
						jitter = jitterSum / int64(len(latencies)-1)
					}

					runtime.EventsEmit(a.ctx, "scan_result", Result{IP: ip, Latency: avgLatency, Jitter: jitter})
				}

				clientsMutex.Lock()
				tested++
				currentTested := tested
				clientsMutex.Unlock()

				if currentTested%10 == 0 || currentTested == total {
					runtime.EventsEmit(a.ctx, "scan_progress", Progress{Tested: currentTested, Total: total})
				}
			}
		}()
	}

	wg.Wait()
	runtime.EventsEmit(a.ctx, "scan_done")
}

func getIPsFromCIDR(cidr string) ([]string, error) {
	ip, ipnet, err := net.ParseCIDR(cidr)
	if err != nil {
		if ip := net.ParseIP(cidr); ip != nil {
			return []string{ip.String()}, nil
		}
		return nil, err
	}

	var ips []string
	for ip := ip.Mask(ipnet.Mask); ipnet.Contains(ip); inc(ip) {
		ips = append(ips, ip.String())
	}
	if len(ips) > 2 {
		return ips[1 : len(ips)-1], nil
	}
	return ips, nil
}

func inc(ip net.IP) {
	for j := len(ip) - 1; j >= 0; j-- {
		ip[j]++
		if ip[j] > 0 {
			break
		}
	}
}
