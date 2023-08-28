Feature: Route segy integration test

  Background: Created necessary segy configuration
    Given create config
    And create subproject
    And create dataset with id integration_test_dataset.sgy
    And upload dataset with id integration_test_dataset.sgy

  Scenario: V2 Endpoint check
    When revision endpoint is called
    Then revision response should have value 0

    When is3D endpoint is called
    Then is3D response should have value True

    When traceHeaderFieldCount endpoint is called
    Then traceHeaderFieldCount response should have value 73

    When textualHeader endpoint is called
    Then textualHeader response should have value integration_test_segy_textualHeader_response.json

    When extendedTextualHeaders endpoint is called
    Then extendedTextualHeaders response should have value integration_test_segy_extendedTextualHeaders_response.json

    When rawTraceHeaders endpoint is called
    Then rawTraceHeaders response should have value integration_test_segy_rawTraceHeaders_response.json

    When scaledTraceHeaders endpoint is called
    Then scaledTraceHeaders response should have value integration_test_segy_scaledTraceHeaders_response.json
