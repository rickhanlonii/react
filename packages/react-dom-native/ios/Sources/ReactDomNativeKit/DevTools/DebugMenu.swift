#if DEBUG
import UIKit

/// Bottom-sheet debug menu triggered by Cmd+Shift+D.
/// Provides developer tool actions (e.g. opening Chrome DevTools).
class DebugMenu {

    static let shared = DebugMenu()

    private var menuWindow: UIWindow?

    func show() {
        // Guard against presenting when already visible
        guard menuWindow == nil else { return }

        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }) else {
            return
        }

        let window = UIWindow(windowScene: scene)
        window.windowLevel = .alert + 1

        let menuVC = DebugMenuViewController()
        menuVC.onDismiss = { [weak self] in
            self?.dismiss()
        }

        let navController = UINavigationController(rootViewController: menuVC)
        navController.modalPresentationStyle = .pageSheet
        if let sheet = navController.sheetPresentationController {
            sheet.detents = [.medium()]
        }

        // Use a clear root VC to present the sheet from
        let rootVC = UIViewController()
        rootVC.view.backgroundColor = .clear
        window.rootViewController = rootVC
        window.makeKeyAndVisible()

        // Track dismiss via the presentation controller delegate
        navController.presentationController?.delegate = menuVC

        self.menuWindow = window
        rootVC.present(navController, animated: true)
    }

    private func dismiss() {
        menuWindow?.isHidden = true
        menuWindow = nil
    }
}

// MARK: - DebugMenuViewController

private class DebugMenuViewController: UIViewController,
    UITableViewDataSource,
    UITableViewDelegate,
    UIAdaptivePresentationControllerDelegate
{

    var onDismiss: (() -> Void)?

    private let tableView = UITableView(frame: .zero, style: .insetGrouped)

    private struct Action {
        let title: String
        let subtitle: String?
        let handler: () -> Void
    }

    private struct Toggle {
        let title: String
        let subtitle: String?
        let isOn: () -> Bool
        let handler: (Bool) -> Void
    }

    private var actions: [Action] = []
    private var toggles: [Toggle] = []

    override func viewDidLoad() {
        super.viewDidLoad()

        title = "Debug Menu"
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .close,
            target: self,
            action: #selector(closeTapped)
        )

        actions = [
            Action(
                title: "Open DevTools Inspector",
                subtitle: "Opens Chrome DevTools connected to JSC",
                handler: {
                    ReactRuntime.shared.openDevTools()
                }
            ),
        ]

        toggles = [
            Toggle(
                title: "Speculative Layout",
                subtitle: "Background Yoga layout during reconciliation",
                isOn: { ReactRuntime.shared.bindings?.speculativeLayoutEnabled ?? false },
                handler: { newValue in
                    ReactRuntime.shared.bindings?.speculativeLayoutEnabled = newValue
                }
            ),
        ]

        tableView.dataSource = self
        tableView.delegate = self
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "cell")
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "toggleCell")

        view.addSubview(tableView)
        tableView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    @objc private func closeTapped() {
        dismiss(animated: true) { [weak self] in
            self?.onDismiss?()
        }
    }

    // MARK: - UIAdaptivePresentationControllerDelegate

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        onDismiss?()
    }

    // MARK: - UITableViewDataSource

    func numberOfSections(in tableView: UITableView) -> Int {
        2
    }

    func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        section == 0 ? "Actions" : "Settings"
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        section == 0 ? actions.count : toggles.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        if indexPath.section == 0 {
            let cell = tableView.dequeueReusableCell(withIdentifier: "cell", for: indexPath)
            let action = actions[indexPath.row]

            var content = cell.defaultContentConfiguration()
            content.text = action.title
            content.secondaryText = action.subtitle
            cell.contentConfiguration = content
            cell.accessoryType = .disclosureIndicator

            return cell
        } else {
            let cell = tableView.dequeueReusableCell(withIdentifier: "toggleCell", for: indexPath)
            let toggle = toggles[indexPath.row]

            var content = cell.defaultContentConfiguration()
            content.text = toggle.title
            content.secondaryText = toggle.subtitle
            cell.contentConfiguration = content
            cell.accessoryType = .none
            cell.selectionStyle = .none

            let switchView = UISwitch()
            switchView.isOn = toggle.isOn()
            switchView.tag = indexPath.row
            switchView.addTarget(self, action: #selector(toggleChanged(_:)), for: .valueChanged)
            cell.accessoryView = switchView

            return cell
        }
    }

    @objc private func toggleChanged(_ sender: UISwitch) {
        let toggle = toggles[sender.tag]
        toggle.handler(sender.isOn)
    }

    // MARK: - UITableViewDelegate

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard indexPath.section == 0 else { return }
        let action = actions[indexPath.row]
        dismiss(animated: true) { [weak self] in
            self?.onDismiss?()
            action.handler()
        }
    }
}
#endif
