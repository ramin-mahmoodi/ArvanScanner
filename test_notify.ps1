[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$iconPath = Join-Path $env:TEMP "arvan_icon.png"
$url = "file:///" + $iconPath.Replace('\', '/')
$template = @"
<toast>
    <visual>
        <binding template="ToastGeneric">
            <text id="1">Arvan Scanner</text>
            <text id="2">اسکن آی‌پی‌ها با موفقیت پایان یافت یا متوقف شد!</text>
            <image placement="appLogoOverride" hint-crop="circle" src="$url"/>
        </binding>
    </visual>
</toast>
"@
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("ArvanScanner").Show($toast)
