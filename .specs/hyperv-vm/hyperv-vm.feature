Feature: HYPERV001 Reusable Hyper-V VM lifecycle

  Background:
    Given a disposable Hyper-V VM configuration fixture

  @FR-1
  Scenario: HYPERV001_01 apply creates media starts VM and records resumable state
    Given Hyper-V commands are captured by a disposable command seam
    When the Hyper-V VM Apply action runs
    Then provisioning media is attached before the VM starts
    And state records the VM identity config fingerprint and next lifecycle step

  @FR-2
  Scenario: HYPERV001_02 Ubuntu provisioning pins host identity
    Given an Ubuntu NoCloud fixture with an SSH public key
    When provisioning media is generated
    Then cloud-init installs Docker CE and the configured SSH identity
    And the generated host-key fingerprint is recorded for strict enrollment

  @FR-3
  Scenario: HYPERV001_03 rollback restores captured optimization settings
    Given an optimization snapshot exists before mutation
    When the Rollback action runs
    Then the checked-in restore implementation consumes the snapshot
    And the snapshot is archived only after successful restoration

  @FR-4
  Scenario: HYPERV001_04 invalid before-after evidence is rejected
    Given before and after measurement artifacts
    When their phase path timestamp limits config or workload identity differs
    Then comparison refuses to certify the optimization

  @FR-5
  Scenario: HYPERV001_05 verification checks actual Docker and cache policy
    Given guest verification command results
    When Docker or BuildKit policy does not match configuration
    Then the verification result is failed without a false green

  @FR-6
  Scenario: HYPERV001_06 canonical and agent skill trees remain identical
    Given the canonical Hyper-V skill tree
    When the mirror parity check runs
    Then every canonical file has one byte-identical agent mirror

  @FR-3
  Scenario: HYPERV001_07 existing Windows 11 guest gets reversible nested virtualization
    Given an existing Windows 11 nested virtualization repair implementation
    When the nested virtualization repair scripts are parsed
    Then a running guest requires explicit graceful shutdown approval before processor mutation
    And rollback restores captured processor and opt-in network state

  @FR-5
  Scenario: HYPERV001_08 Windows 11 guest verification proves a real WSL2 runtime
    Given Windows guest nested virtualization verification scripts
    When the nested virtualization verification scripts are parsed
    Then verification requires real WSL2 kernel process and Docker evidence
    And active-hypervisor CPU flags are not treated as conclusive
    And E_UNEXPECTED collects bounded guest event diagnostics
