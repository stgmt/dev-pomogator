@{
    SchemaVersion = 1
    Name = 'dev-vm'
    Guest = 'ubuntu-server' # windows-ltsc | ubuntu-server
    Generation = 2
    ProcessorCount = 2
    Memory = @{
        Dynamic = $false
        StartupMB = 4096
        MinimumMB = 2048
        MaximumMB = 4096
        BufferPercent = 10
    }
    Disk = @{
        SizeGB = 80
        Dynamic = $true
        RootDirectory = 'D:\Hyper-V'
    }
    Network = @{
        SwitchName = 'Default Switch'
        AllowUntrustedNetwork = $false
    }
    Install = @{
        Source = 'C:\ISO\official-image.iso'
        ExpectedSha256 = 'REPLACE_WITH_VENDOR_PUBLISHED_SHA256'
        Locale = 'en-US'
        TimeZone = 'UTC'
    }
    Access = @{
        AdminUser = 'vmadmin'
        AdminPasswordEnv = 'HYPERV_VM_ADMIN_PASSWORD'
        SecretVault = $null
        SecretName = $null
        EnableRdp = $false
        SshPublicKeyPath = '~\.ssh\id_ed25519.pub'
        SshPrivateKeyPath = '~\.ssh\id_ed25519'
        SshPrivateKeyPassphraseEnv = 'HYPERV_VM_SSH_PASSPHRASE'
        EnablePasswordSsh = $false
    }
    Features = @{
        NestedVirtualization = $true
        InstallWslDocker = $false
        InstallDocker = $true
        WslDistribution = 'Ubuntu-24.04'
        WslMemoryMB = 3072
        WslSwapMB = 1024
        SparseVhd = $true
        AutoMemoryReclaim = 'dropCache'
        BuildCacheLimitGB = 25
    }
    Optimization = @{
        Enabled = $true
        Profile = 'Conservative'
        DisableServices = @()
        DisableSecurity = $false
        DisableFirewall = $false
        DisableUpdates = $false
        ConsolidateServiceHosts = $true
    }
    Safety = @{
        AllowReplaceExistingVm = $false
        AllowDelete = $false
        RequireOfficialSource = $true
    }
    StateDirectory = '.\hyperv-vm-state'
    ReportDirectory = '.\hyperv-vm-reports'
}
