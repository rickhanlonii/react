import XCTest
import UIKit
@testable import ReactDomNativeKit
@testable import ShadowTree

final class MPAFormSubmitTests: XCTestCase {

    // MARK: - ShadowNodeFamily property storage

    func testFormActionURLStored() {
        let family = ShadowNodeFamily(elementType: "form", surfaceId: 1, instanceHandle: nil)
        XCTAssertNil(family.formActionURL)
        family.formActionURL = "http://localhost:6001/ssr/test"
        XCTAssertEqual(family.formActionURL, "http://localhost:6001/ssr/test")
    }

    func testInputNameStored() {
        let family = ShadowNodeFamily(elementType: "input", surfaceId: 1, instanceHandle: nil)
        XCTAssertNil(family.inputName)
        family.inputName = "username"
        XCTAssertEqual(family.inputName, "username")
    }

    // MARK: - collectFormData

    func testCollectFormDataFromNestedTextFields() {
        let viewRegistry = ViewRegistry()
        let applier = UIKitMutationApplier(viewRegistry: viewRegistry, logPrefix: "Test")

        // Build hierarchy: UIView (form) > UIView (div) > UITextField (name="email") + UITextField (name="password")
        let formView = UIView()
        let divView = UIView()
        let emailField = UITextField()
        emailField.text = "a@b.com"
        let passwordField = UITextField()
        passwordField.text = "secret"

        formView.addSubview(divView)
        divView.addSubview(emailField)
        divView.addSubview(passwordField)

        // Register families
        let formFamily = ShadowNodeFamily(elementType: "form", surfaceId: 1, instanceHandle: nil)
        formFamily.formActionURL = "/submit"
        viewRegistry.register(view: formView, family: formFamily)

        let divFamily = ShadowNodeFamily(elementType: "div", surfaceId: 1, instanceHandle: nil)
        viewRegistry.register(view: divView, family: divFamily)

        let emailFamily = ShadowNodeFamily(elementType: "input", surfaceId: 1, instanceHandle: nil)
        emailFamily.inputName = "email"
        viewRegistry.register(view: emailField, family: emailFamily)

        let passwordFamily = ShadowNodeFamily(elementType: "input", surfaceId: 1, instanceHandle: nil)
        passwordFamily.inputName = "password"
        viewRegistry.register(view: passwordField, family: passwordFamily)

        var fields: [String: String] = [:]
        applier.collectFormData(from: formView, into: &fields)

        XCTAssertEqual(fields["email"], "a@b.com")
        XCTAssertEqual(fields["password"], "secret")
        XCTAssertEqual(fields.count, 2)
    }

    func testCollectFormDataSkipsFieldsWithoutName() {
        let viewRegistry = ViewRegistry()
        let applier = UIKitMutationApplier(viewRegistry: viewRegistry, logPrefix: "Test")

        let formView = UIView()
        let textField = UITextField()
        textField.text = "unnamed"
        formView.addSubview(textField)

        // Register with no inputName set
        let inputFamily = ShadowNodeFamily(elementType: "input", surfaceId: 1, instanceHandle: nil)
        viewRegistry.register(view: textField, family: inputFamily)

        var fields: [String: String] = [:]
        applier.collectFormData(from: formView, into: &fields)

        XCTAssertTrue(fields.isEmpty, "Fields without inputName should be skipped")
    }

    func testCollectFormDataEmptyTextFieldValue() {
        let viewRegistry = ViewRegistry()
        let applier = UIKitMutationApplier(viewRegistry: viewRegistry, logPrefix: "Test")

        let formView = UIView()
        let textField = UITextField()
        // text is nil by default
        formView.addSubview(textField)

        let inputFamily = ShadowNodeFamily(elementType: "input", surfaceId: 1, instanceHandle: nil)
        inputFamily.inputName = "q"
        viewRegistry.register(view: textField, family: inputFamily)

        var fields: [String: String] = [:]
        applier.collectFormData(from: formView, into: &fields)

        XCTAssertEqual(fields["q"], "", "Empty text fields should have empty string value")
    }

    // MARK: - attemptMPAFormSubmit

    func testAttemptMPAFormSubmitFindsFormAncestor() {
        let viewRegistry = ViewRegistry()
        let applier = UIKitMutationApplier(viewRegistry: viewRegistry, logPrefix: "Test")

        // Build hierarchy: UIView (form, formActionURL="/submit") > UIView (div) > UIButton (button)
        let formView = UIView()
        let divView = UIView()
        let buttonView = UIButton()

        formView.addSubview(divView)
        divView.addSubview(buttonView)

        let formFamily = ShadowNodeFamily(elementType: "form", surfaceId: 1, instanceHandle: nil)
        formFamily.formActionURL = "/submit"
        viewRegistry.register(view: formView, family: formFamily)

        let divFamily = ShadowNodeFamily(elementType: "div", surfaceId: 1, instanceHandle: nil)
        viewRegistry.register(view: divView, family: divFamily)

        let buttonFamily = ShadowNodeFamily(elementType: "button", surfaceId: 1, instanceHandle: nil)
        viewRegistry.register(view: buttonView, family: buttonFamily)

        let result = applier.attemptMPAFormSubmit(from: buttonView)
        XCTAssertTrue(result, "Should return true when form with action URL is found")
    }

    func testAttemptMPAFormSubmitNoFormAncestor() {
        let viewRegistry = ViewRegistry()
        let applier = UIKitMutationApplier(viewRegistry: viewRegistry, logPrefix: "Test")

        // Build hierarchy: UIView (div) > UIButton (button) — no form
        let divView = UIView()
        let buttonView = UIButton()
        divView.addSubview(buttonView)

        let divFamily = ShadowNodeFamily(elementType: "div", surfaceId: 1, instanceHandle: nil)
        viewRegistry.register(view: divView, family: divFamily)

        let buttonFamily = ShadowNodeFamily(elementType: "button", surfaceId: 1, instanceHandle: nil)
        viewRegistry.register(view: buttonView, family: buttonFamily)

        let result = applier.attemptMPAFormSubmit(from: buttonView)
        XCTAssertFalse(result, "Should return false when no form ancestor exists")
    }

    func testAttemptMPAFormSubmitFormWithNoActionURL() {
        let viewRegistry = ViewRegistry()
        let applier = UIKitMutationApplier(viewRegistry: viewRegistry, logPrefix: "Test")

        // Build hierarchy: UIView (form, no action) > UIButton (button)
        let formView = UIView()
        let buttonView = UIButton()
        formView.addSubview(buttonView)

        let formFamily = ShadowNodeFamily(elementType: "form", surfaceId: 1, instanceHandle: nil)
        // formActionURL is nil
        viewRegistry.register(view: formView, family: formFamily)

        let buttonFamily = ShadowNodeFamily(elementType: "button", surfaceId: 1, instanceHandle: nil)
        viewRegistry.register(view: buttonView, family: buttonFamily)

        let result = applier.attemptMPAFormSubmit(from: buttonView)
        XCTAssertFalse(result, "Should return false when form has no action URL")
    }

    func testAttemptMPAFormSubmitFormWithEmptyActionURL() {
        let viewRegistry = ViewRegistry()
        let applier = UIKitMutationApplier(viewRegistry: viewRegistry, logPrefix: "Test")

        // Build hierarchy: UIView (form, action="") > UIButton (button)
        let formView = UIView()
        let buttonView = UIButton()
        formView.addSubview(buttonView)

        let formFamily = ShadowNodeFamily(elementType: "form", surfaceId: 1, instanceHandle: nil)
        formFamily.formActionURL = ""
        viewRegistry.register(view: formView, family: formFamily)

        let buttonFamily = ShadowNodeFamily(elementType: "button", surfaceId: 1, instanceHandle: nil)
        viewRegistry.register(view: buttonView, family: buttonFamily)

        let result = applier.attemptMPAFormSubmit(from: buttonView)
        XCTAssertFalse(result, "Should return false when form has empty action URL")
    }
}
