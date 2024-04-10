import { Fragment, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useRouter } from "next/router";
import { Controller, useForm } from "react-hook-form";
// icons
import { Sparkle } from "lucide-react";
// headless ui
import { Dialog, Transition } from "@headlessui/react";
// text editor
import { RichTextEditorWithRef } from "@plane/rich-text-editor";
// types
import { TIssue } from "@plane/types";
// ui
import { Button, Input, ToggleSwitch, TOAST_TYPE, setToast } from "@plane/ui";
// components
import { GptAssistantPopover } from "@/components/core";
import { PriorityDropdown } from "@/components/dropdowns";
// constants
import { ISSUE_CREATED } from "@/constants/event-tracker";
// hooks
import { useEventTracker, useWorkspace, useMention, useInstance, useProjectInbox } from "@/hooks/store";
// services
import { AIService } from "@/services/ai.service";
import { FileService } from "@/services/file.service";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const defaultValues: Partial<TIssue> = {
  name: "",
  description_html: "<p></p>",
  priority: "none",
};

// services
const aiService = new AIService();
const fileService = new FileService();

export const CreateInboxIssueModal: React.FC<Props> = observer((props) => {
  const { isOpen, onClose } = props;
  // router
  const router = useRouter();
  const { workspaceSlug, projectId } = router.query;
  if (!workspaceSlug || !projectId) return null;
  // states
  const [createMore, setCreateMore] = useState(false);
  const [gptAssistantModal, setGptAssistantModal] = useState(false);
  const [iAmFeelingLucky, setIAmFeelingLucky] = useState(false);
  // refs
  const editorRef = useRef<any>(null);
  // hooks
  const { mentionHighlights, mentionSuggestions } = useMention();
  const workspaceStore = useWorkspace();
  const workspaceId = workspaceStore.getWorkspaceBySlug(workspaceSlug as string)?.id as string;
  // store hooks
  const { createInboxIssue } = useProjectInbox();
  const { instance } = useInstance();
  const { captureIssueEvent } = useEventTracker();
  // form info
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    reset,
    watch,
    getValues,
  } = useForm<Partial<TIssue>>({ defaultValues });
  const issueName = watch("name");

  const handleClose = () => {
    onClose();
    reset(defaultValues);
    editorRef?.current?.clearEditor();
  };

  const handleFormSubmit = async (formData: Partial<TIssue>) => {
    if (!workspaceSlug || !projectId) return;
    await createInboxIssue(workspaceSlug.toString(), projectId.toString(), formData)
      .then((res) => {
        if (!createMore) {
          router.push(`/${workspaceSlug}/projects/${projectId}/inbox/?currentTab=open&inboxIssueId=${res?.issue?.id}`);
          handleClose();
        } else {
          reset(defaultValues);
          editorRef?.current?.clearEditor();
        }
        captureIssueEvent({
          eventName: ISSUE_CREATED,
          payload: {
            ...formData,
            state: "SUCCESS",
            element: "Inbox page",
          },
          path: router.pathname,
        });
      })
      .catch((error) => {
        console.error(error);
        captureIssueEvent({
          eventName: ISSUE_CREATED,
          payload: {
            ...formData,
            state: "FAILED",
            element: "Inbox page",
          },
          path: router.pathname,
        });
      });
  };

  const handleAiAssistance = async (response: string) => {
    if (!workspaceSlug || !projectId) return;
    editorRef.current?.setEditorValueAtCursorPosition(response);
  };

  const handleAutoGenerateDescription = async () => {
    const issueName = getValues("name");
    if (!workspaceSlug || !projectId || !issueName) return;

    setIAmFeelingLucky(true);

    aiService
      .createGptTask(workspaceSlug as string, projectId as string, {
        prompt: issueName,
        task: "Generate a proper description for this issue.",
      })
      .then((res) => {
        if (res.response === "")
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error!",
            message:
              "Issue title isn't informative enough to generate the description. Please try with a different title.",
          });
        else handleAiAssistance(res.response_html);
      })
      .catch((err) => {
        const error = err?.data?.error;

        if (err.status === 429)
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error!",
            message: error || "You have reached the maximum number of requests of 50 requests per month per user.",
          });
        else
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error!",
            message: error || "Some error occurred. Please try again.",
          });
      })
      .finally(() => setIAmFeelingLucky(false));
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-20" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-custom-backdrop transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="my-10 flex items-center justify-center p-4 text-center sm:p-0 md:my-20">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform rounded-lg bg-custom-background-100 p-5 text-left shadow-custom-shadow-md transition-all sm:w-full sm:max-w-2xl">
                <form onSubmit={handleSubmit(handleFormSubmit)}>
                  <div className="space-y-5">
                    <h3 className="text-xl font-semibold leading-6 text-custom-text-100">Create Inbox Issue</h3>
                    <div className="space-y-3">
                      <div className="mt-2 space-y-3">
                        <div>
                          <Controller
                            control={control}
                            name="name"
                            rules={{
                              required: "Title is required",
                              maxLength: {
                                value: 255,
                                message: "Title should be less than 255 characters",
                              },
                            }}
                            render={({ field: { value, onChange, ref } }) => (
                              <Input
                                id="name"
                                name="name"
                                type="text"
                                value={value}
                                onChange={onChange}
                                ref={ref}
                                hasError={Boolean(errors.name)}
                                placeholder="Title"
                                className="w-full resize-none text-xl"
                              />
                            )}
                          />
                        </div>
                        <div className="relative">
                          <div className="border-0.5 absolute bottom-3.5 right-3.5 z-10 flex rounded bg-custom-background-80">
                            {watch("name") && issueName !== "" && (
                              <button
                                type="button"
                                className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-custom-background-90 ${
                                  iAmFeelingLucky ? "cursor-wait" : ""
                                }`}
                                onClick={handleAutoGenerateDescription}
                                disabled={iAmFeelingLucky}
                              >
                                {iAmFeelingLucky ? (
                                  "Generating response..."
                                ) : (
                                  <>
                                    <Sparkle className="h-4 w-4" />I{"'"}m feeling lucky
                                  </>
                                )}
                              </button>
                            )}

                            {instance?.config?.has_openai_configured && (
                              <GptAssistantPopover
                                isOpen={gptAssistantModal}
                                projectId={projectId.toString()}
                                handleClose={() => {
                                  setGptAssistantModal((prevData) => !prevData);
                                  // this is done so that the title do not reset after gpt popover closed
                                  reset(getValues());
                                }}
                                onResponse={(response) => {
                                  handleAiAssistance(response);
                                }}
                                button={
                                  <button
                                    type="button"
                                    className="flex items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-custom-background-90"
                                    onClick={() => setGptAssistantModal((prevData) => !prevData)}
                                  >
                                    <Sparkle className="h-4 w-4" />
                                    AI
                                  </button>
                                }
                                className="!min-w-[38rem]"
                                placement="top-end"
                              />
                            )}
                          </div>
                          <Controller
                            name="description_html"
                            control={control}
                            render={({ field: { value, onChange } }) => (
                              <RichTextEditorWithRef
                                cancelUploadImage={fileService.cancelUpload}
                                uploadFile={fileService.getUploadFileFunction(workspaceSlug as string)}
                                deleteFile={fileService.getDeleteImageFunction(workspaceId)}
                                restoreFile={fileService.getRestoreImageFunction(workspaceId)}
                                ref={editorRef}
                                debouncedUpdatesEnabled={false}
                                value={!value || value === "" ? "<p></p>" : value}
                                customClassName="min-h-[150px]"
                                onChange={(description, description_html: string) => {
                                  onChange(description_html);
                                }}
                                mentionSuggestions={mentionSuggestions}
                                mentionHighlights={mentionHighlights}
                              />
                            )}
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Controller
                            control={control}
                            name="priority"
                            render={({ field: { value, onChange } }) => (
                              <div className="h-5">
                                <PriorityDropdown
                                  value={value ?? "none"}
                                  onChange={onChange}
                                  buttonVariant="background-with-text"
                                />
                              </div>
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="-mx-5 mt-5 flex items-center justify-between gap-2 border-t border-custom-border-200 px-5 pt-5">
                    <div
                      className="flex cursor-pointer items-center gap-1"
                      onClick={() => setCreateMore((prevData) => !prevData)}
                    >
                      <span className="text-xs">Create more</span>
                      <ToggleSwitch value={createMore} onChange={() => {}} size="md" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="neutral-primary" size="sm" onClick={() => handleClose()}>
                        Discard
                      </Button>
                      <Button variant="primary" size="sm" type="submit" loading={isSubmitting}>
                        {isSubmitting ? "Adding Issue..." : "Add Issue"}
                      </Button>
                    </div>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
});
