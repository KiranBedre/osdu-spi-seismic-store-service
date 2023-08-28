Feature: Route openzgy integration test
  Background: Created necessary openzgy configuration
    Given create config
    And create subproject
    And create dataset with id integration_test_dataset.zgy
    And upload dataset with id integration_test_dataset.zgy

  Scenario: V1 Bingrid endpoint response
    When v1_bingrid endpoint is called
    Then v1_bingrid response should have value integration_test_bingrid_response.json

