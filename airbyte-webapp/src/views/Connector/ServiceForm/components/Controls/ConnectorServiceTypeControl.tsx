import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useField } from "formik";
import React, { useCallback, useEffect, useMemo } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { components } from "react-select";
import { MenuListProps } from "react-select";

import { ConnectorIcon } from "components/ConnectorIcon";
import { GAIcon } from "components/icons/GAIcon";
import { ControlLabels } from "components/LabeledControl";
import {
  DropDown,
  DropDownOptionDataItem,
  DropDownOptionProps,
  OptionView,
  SingleValueIcon,
  SingleValueProps,
  SingleValueView,
} from "components/ui/DropDown";
import { Text } from "components/ui/Text";

import { Action, Namespace } from "core/analytics";
import { Connector, ConnectorDefinition } from "core/domain/connector";
import { ReleaseStage } from "core/request/AirbyteClient";
import { useAvailableConnectorDefinitions } from "hooks/domain/connector/useAvailableConnectorDefinitions";
import { useAnalyticsService } from "hooks/services/Analytics";
import { useExperiment } from "hooks/services/Experiment";
import { useCurrentWorkspace } from "hooks/services/useWorkspace";
import { naturalComparator } from "utils/objects";
import { useDocumentationPanelContext } from "views/Connector/ConnectorDocumentationLayout/DocumentationPanelContext";

import { WarningMessage } from "../WarningMessage";
import styles from "./ConnectorServiceTypeControl.module.scss";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MenuWithRequestButtonProps = MenuListProps<DropDownOptionDataItem, false> & { selectProps: any };

/**
 * Returns the order for a specific release stage label. This will define
 * in what order the different release stages are shown inside the select.
 * They will be shown in an increasing order (i.e. 0 on top), unless not overwritten
 * by ORDER_OVERWRITE above.
 */
function getOrderForReleaseStage(stage?: ReleaseStage): number {
  switch (stage) {
    case ReleaseStage.beta:
      return 1;
    case ReleaseStage.alpha:
      return 2;
    default:
      return 0;
  }
}

const ConnectorList: React.FC<React.PropsWithChildren<MenuWithRequestButtonProps>> = ({ children, ...props }) => (
  <>
    <components.MenuList {...props}>{children}</components.MenuList>
    <div className={styles.connectorListFooter}>
      <button
        className={styles.requestNewConnectorBtn}
        onClick={() => props.selectProps.selectProps.onOpenRequestConnectorModal(props.selectProps.inputValue)}
      >
        <FontAwesomeIcon icon={faPlus} />
        <FormattedMessage id="connector.requestConnectorBlock" />
      </button>
    </div>
  </>
);

const StageLabel: React.FC<{ releaseStage?: ReleaseStage }> = ({ releaseStage }) => {
  if (!releaseStage) {
    return null;
  }

  if (releaseStage === ReleaseStage.generally_available) {
    return <GAIcon />;
  }

  return (
    <div className={styles.stageLabel}>
      <FormattedMessage id={`connector.releaseStage.${releaseStage}`} defaultMessage={releaseStage} />
    </div>
  );
};

const Option: React.FC<DropDownOptionProps> = (props) => {
  return (
    <components.Option {...props}>
      <OptionView data-testid={props.data.label} isSelected={props.isSelected} isDisabled={props.isDisabled}>
        <div className={styles.connectorName}>
          {props.data.img || null}
          <Text size="lg">{props.label}</Text>
        </div>
        <StageLabel releaseStage={props.data.releaseStage} />
      </OptionView>
    </components.Option>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SingleValue: React.FC<SingleValueProps<any>> = (props) => {
  return (
    <SingleValueView>
      {props.data.img && <SingleValueIcon>{props.data.img}</SingleValueIcon>}
      <div>
        <components.SingleValue className={styles.singleValueContent} {...props}>
          {props.data.label}
          <StageLabel releaseStage={props.data.releaseStage} />
        </components.SingleValue>
      </div>
    </SingleValueView>
  );
};

interface ConnectorServiceTypeControlProps {
  propertyPath: string;
  formType: "source" | "destination";
  availableServices: ConnectorDefinition[];
  isEditMode?: boolean;
  documentationUrl?: string;
  onChangeServiceType?: (id: string) => void;
  onOpenRequestConnectorModal: (initialName: string) => void;
  disabled?: boolean;
}

const ConnectorServiceTypeControl: React.FC<ConnectorServiceTypeControlProps> = ({
  propertyPath,
  formType,
  isEditMode,
  onChangeServiceType,
  availableServices,
  documentationUrl,
  onOpenRequestConnectorModal,
  disabled,
}) => {
  const { formatMessage } = useIntl();
  const orderOverwrite = useExperiment("connector.orderOverwrite", {});
  const [field, fieldMeta, { setValue }] = useField(propertyPath);
  const analytics = useAnalyticsService();
  const workspace = useCurrentWorkspace();
  const availableConnectorDefinitions = useAvailableConnectorDefinitions(availableServices, workspace);
  const sortedDropDownData = useMemo(
    () =>
      availableConnectorDefinitions
        .map((item) => ({
          label: item.name,
          value: Connector.id(item),
          img: <ConnectorIcon icon={item.icon} />,
          releaseStage: item.releaseStage,
        }))
        .sort((a, b) => {
          const priorityA = orderOverwrite[a.value] ?? 0;
          const priorityB = orderOverwrite[b.value] ?? 0;
          // If they have different priority use the higher priority first, otherwise use the label
          if (priorityA !== priorityB) {
            return priorityB - priorityA;
          } else if (a.releaseStage !== b.releaseStage) {
            return getOrderForReleaseStage(a.releaseStage) - getOrderForReleaseStage(b.releaseStage);
          }
          return naturalComparator(a.label, b.label);
        }),
    [availableConnectorDefinitions, orderOverwrite]
  );

  const { setDocumentationUrl } = useDocumentationPanelContext();

  useEffect(() => setDocumentationUrl(documentationUrl ?? ""), [documentationUrl, setDocumentationUrl]);

  const getNoOptionsMessage = useCallback(
    ({ inputValue }: { inputValue: string }) => {
      analytics.track(formType === "source" ? Namespace.SOURCE : Namespace.DESTINATION, Action.NO_MATCHING_CONNECTOR, {
        actionDescription: "Connector query without results",
        query: inputValue,
      });
      return formatMessage({ id: "form.noConnectorFound" });
    },
    [analytics, formType, formatMessage]
  );

  const selectedService = React.useMemo(
    () => availableServices.find((s) => Connector.id(s) === field.value),
    [field.value, availableServices]
  );

  const handleSelect = useCallback(
    (item: DropDownOptionDataItem | null) => {
      if (item) {
        setValue(item.value);
        if (onChangeServiceType) {
          onChangeServiceType(item.value);
        }
      }
    },
    [setValue, onChangeServiceType]
  );

  const onMenuOpen = () => {
    analytics.track(formType === "source" ? Namespace.SOURCE : Namespace.DESTINATION, Action.SELECTION_OPENED, {
      actionDescription: "Opened connector type selection",
    });
  };

  return (
    <>
      <ControlLabels
        label={formatMessage({
          id: `form.${formType}Type`,
        })}
      >
        <DropDown
          {...field}
          components={{
            MenuList: ConnectorList,
            Option,
            SingleValue,
          }}
          selectProps={{ onOpenRequestConnectorModal }}
          error={!!fieldMeta.error && fieldMeta.touched}
          isDisabled={isEditMode || disabled}
          isSearchable
          placeholder={formatMessage({
            id: "form.selectConnector",
          })}
          options={sortedDropDownData}
          onChange={handleSelect}
          onMenuOpen={onMenuOpen}
          noOptionsMessage={getNoOptionsMessage}
        />
      </ControlLabels>
      {selectedService &&
        (selectedService.releaseStage === ReleaseStage.alpha || selectedService.releaseStage === ReleaseStage.beta) && (
          <WarningMessage stage={selectedService.releaseStage} />
        )}
    </>
  );
};

export { ConnectorServiceTypeControl };
