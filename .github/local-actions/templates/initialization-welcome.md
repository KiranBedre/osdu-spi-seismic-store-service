# Welcome to the OSDU SPI Management System!

Thank you for creating a repository from the **OSDU SPI Management Template**!

Welcome to the OSDU SPI Management Template! This template will help you maintain a long-lived fork of an upstream OSDU repository.

## Next Steps

To complete the initialization of your fork management repository, please provide the upstream repository you want to fork from.

### Supported Formats

**GitHub Repository:**
```
owner/repository-name
```
Example: `microsoft/OSDU` or `Azure/osdu-infrastructure`

**GitLab Repository:**
```
https://gitlab.company.com/group/repository-name
```

### Instructions

1. **Reply to this issue** with the repository reference on the first line
2. The automation will validate your input and begin the setup process
3. You'll receive updates as the initialization progresses
4. Once complete, this issue will be automatically closed

### What happens during initialization?

- Configure the three-branch structure (`main`, `fork_upstream`, `fork_integration`)
- Generate a filtered `fork_upstream` containing only the shared upstream code
- Seed the fork-owned Azure provider and test trees onto `main`
- Set up branch protection rules
- Configure upstream repository connection
- Enable automated sync workflows
- Set up security scanning and dependabot

### Repositories without a provider/core split

The default `filter` mode is for Java service repositories with separate
`provider/<service>-azure` and `testing/<service>-test-azure` trees. For a DDMS,
DAG, library, or other repository that must initially remain intact, add this
second line:

```
mode: passthrough
```

Passthrough keeps the upstream tree byte for byte, adds the SPI engineering
system on the integration branch, and continues syncing future upstream
changes without filtering or one-time Azure seeding.

> **Nonconventional services**: the filter configuration is generated from a template using the upstream repository name. If this service's Maven module prefix differs from that name, or its upstream layout deviates from the conventional shape, commit a complete `.github/upstream-filter.yml` to `main` before replying; initialization will use it instead.

---

**Ready to get started?** Just reply with your upstream repository! 🎯