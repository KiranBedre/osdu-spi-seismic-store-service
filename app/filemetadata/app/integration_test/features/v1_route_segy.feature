Feature: Route segy integration test

  Background: Created necessary segy configuration
    Given create config
    And create subproject
    And create dataset with id integration_test_dataset.sgy
    And upload dataset with id integration_test_dataset.sgy

  Scenario: V1 Endpoint check
    When v1_revision endpoint is called
    Then v1_revision response should have value 0

    When v1_is3D endpoint is called
    Then v1_is3D response should have value True

    When v1_traceHeaderFieldCount endpoint is called
    Then v1_traceHeaderFieldCount response should have value 73

    When v1_textualHeader endpoint is called
    Then v1_textualHeader response should have value integration_test_segy_textualHeader_response.json

    When v1_extendedTextualHeaders endpoint is called
    Then v1_extendedTextualHeaders response should have value integration_test_segy_extendedTextualHeaders_response.json

    When v1_rawTraceHeaders endpoint is called
    Then v1_rawTraceHeaders response should have value integration_test_segy_rawTraceHeaders_response.json

    When v1_scaledTraceHeaders endpoint is called
    Then v1_scaledTraceHeaders response should have value integration_test_segy_scaledTraceHeaders_response.json
